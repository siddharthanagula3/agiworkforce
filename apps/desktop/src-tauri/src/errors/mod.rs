use serde::{Deserialize, Serialize};
use std::fmt;

pub mod recovery;

/// Common error codes for the application
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    // Network Errors
    NetworkError,
    NetworkTimeout,
    ApiRateLimit,

    // File System Errors
    FileNotFound,
    PermissionDenied,
    DiskFull,

    // Database Errors
    DatabaseLocked,
    DatabaseCorrupted,

    // Authentication Errors
    AuthFailed,
    TokenExpired,

    // LLM Provider Errors
    LlmApiError,
    LlmContextLength,
    LlmContentFilter,

    // Browser Automation Errors
    BrowserNotFound,
    BrowserCrash,
    ElementNotFound,

    // Automation Errors
    AutomationFailed,
    UiElementTimeout,

    // System Errors
    OutOfMemory,
    SystemError,

    // AGI Errors
    AgiPlanningFailed,
    AgiExecutionFailed,
    AgiToolNotFound,

    // Unknown
    Unknown,
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let code = match self {
            ErrorCode::NetworkError => "NETWORK_ERROR",
            ErrorCode::NetworkTimeout => "NETWORK_TIMEOUT",
            ErrorCode::ApiRateLimit => "API_RATE_LIMIT",
            ErrorCode::FileNotFound => "FILE_NOT_FOUND",
            ErrorCode::PermissionDenied => "PERMISSION_DENIED",
            ErrorCode::DiskFull => "DISK_FULL",
            ErrorCode::DatabaseLocked => "DATABASE_LOCKED",
            ErrorCode::DatabaseCorrupted => "DATABASE_CORRUPTED",
            ErrorCode::AuthFailed => "AUTH_FAILED",
            ErrorCode::TokenExpired => "TOKEN_EXPIRED",
            ErrorCode::LlmApiError => "LLM_API_ERROR",
            ErrorCode::LlmContextLength => "LLM_CONTEXT_LENGTH",
            ErrorCode::LlmContentFilter => "LLM_CONTENT_FILTER",
            ErrorCode::BrowserNotFound => "BROWSER_NOT_FOUND",
            ErrorCode::BrowserCrash => "BROWSER_CRASH",
            ErrorCode::ElementNotFound => "ELEMENT_NOT_FOUND",
            ErrorCode::AutomationFailed => "AUTOMATION_FAILED",
            ErrorCode::UiElementTimeout => "UI_ELEMENT_TIMEOUT",
            ErrorCode::OutOfMemory => "OUT_OF_MEMORY",
            ErrorCode::SystemError => "SYSTEM_ERROR",
            ErrorCode::AgiPlanningFailed => "AGI_PLANNING_FAILED",
            ErrorCode::AgiExecutionFailed => "AGI_EXECUTION_FAILED",
            ErrorCode::AgiToolNotFound => "AGI_TOOL_NOT_FOUND",
            ErrorCode::Unknown => "UNKNOWN_ERROR",
        };
        write!(f, "{}", code)
    }
}

/// AGI-specific errors
#[derive(Debug)]
pub enum AGIError {
    PlanningFailed(String),
    ExecutionFailed(String),
    ToolNotFound(String),
    KnowledgeError(String),
    ResourceLimitExceeded(String),
    InvalidGoal(String),
}

impl fmt::Display for AGIError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AGIError::PlanningFailed(msg) => write!(f, "AGI planning failed: {}", msg),
            AGIError::ExecutionFailed(msg) => write!(f, "AGI execution failed: {}", msg),
            AGIError::ToolNotFound(msg) => write!(f, "AGI tool not found: {}", msg),
            AGIError::KnowledgeError(msg) => write!(f, "AGI knowledge error: {}", msg),
            AGIError::ResourceLimitExceeded(msg) => write!(f, "Resource limit exceeded: {}", msg),
            AGIError::InvalidGoal(msg) => write!(f, "Invalid goal: {}", msg),
        }
    }
}

impl std::error::Error for AGIError {}

impl AGIError {
    pub fn code(&self) -> ErrorCode {
        match self {
            AGIError::PlanningFailed(_) => ErrorCode::AgiPlanningFailed,
            AGIError::ExecutionFailed(_) => ErrorCode::AgiExecutionFailed,
            AGIError::ToolNotFound(_) => ErrorCode::AgiToolNotFound,
            _ => ErrorCode::Unknown,
        }
    }
}

/// Browser automation errors
#[derive(Debug)]
pub enum BrowserError {
    NotFound(String),
    Crashed(String),
    ElementNotFound(String),
    Timeout(String),
    NavigationFailed(String),
    ScriptError(String),
}

impl fmt::Display for BrowserError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BrowserError::NotFound(msg) => write!(f, "Browser not found: {}", msg),
            BrowserError::Crashed(msg) => write!(f, "Browser crashed: {}", msg),
            BrowserError::ElementNotFound(msg) => write!(f, "Element not found: {}", msg),
            BrowserError::Timeout(msg) => write!(f, "Browser timeout: {}", msg),
            BrowserError::NavigationFailed(msg) => write!(f, "Navigation failed: {}", msg),
            BrowserError::ScriptError(msg) => write!(f, "Script error: {}", msg),
        }
    }
}

impl std::error::Error for BrowserError {}

impl BrowserError {
    pub fn code(&self) -> ErrorCode {
        match self {
            BrowserError::NotFound(_) => ErrorCode::BrowserNotFound,
            BrowserError::Crashed(_) => ErrorCode::BrowserCrash,
            BrowserError::ElementNotFound(_) => ErrorCode::ElementNotFound,
            _ => ErrorCode::Unknown,
        }
    }
}

/// UI Automation errors
#[derive(Debug)]
pub enum AutomationError {
    ElementNotFound(String),
    Timeout(String),
    ActionFailed(String),
    InvalidInput(String),
    PermissionDenied(String),
}

impl fmt::Display for AutomationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AutomationError::ElementNotFound(msg) => write!(f, "UI element not found: {}", msg),
            AutomationError::Timeout(msg) => write!(f, "UI automation timeout: {}", msg),
            AutomationError::ActionFailed(msg) => write!(f, "UI action failed: {}", msg),
            AutomationError::InvalidInput(msg) => write!(f, "Invalid input: {}", msg),
            AutomationError::PermissionDenied(msg) => write!(f, "Permission denied: {}", msg),
        }
    }
}

impl std::error::Error for AutomationError {}

impl AutomationError {
    pub fn code(&self) -> ErrorCode {
        match self {
            AutomationError::ElementNotFound(_) => ErrorCode::ElementNotFound,
            AutomationError::Timeout(_) => ErrorCode::UiElementTimeout,
            AutomationError::PermissionDenied(_) => ErrorCode::PermissionDenied,
            _ => ErrorCode::AutomationFailed,
        }
    }
}

/// MCP (Model Context Protocol) errors
#[derive(Debug)]
pub enum MCPError {
    ServerNotFound(String),
    ConnectionFailed(String),
    ToolExecutionFailed(String),
    InvalidResponse(String),
    Timeout(String),
}

impl fmt::Display for MCPError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MCPError::ServerNotFound(msg) => write!(f, "MCP server not found: {}", msg),
            MCPError::ConnectionFailed(msg) => write!(f, "MCP connection failed: {}", msg),
            MCPError::ToolExecutionFailed(msg) => write!(f, "MCP tool execution failed: {}", msg),
            MCPError::InvalidResponse(msg) => write!(f, "Invalid MCP response: {}", msg),
            MCPError::Timeout(msg) => write!(f, "MCP timeout: {}", msg),
        }
    }
}

impl std::error::Error for MCPError {}

impl MCPError {
    pub fn code(&self) -> ErrorCode {
        ErrorCode::SystemError
    }
}

/// LLM Provider errors
#[derive(Debug)]
pub enum LLMError {
    ApiError(String),
    RateLimit(String),
    ContextLength(String),
    ContentFilter(String),
    InvalidResponse(String),
    NetworkError(String),
}

impl fmt::Display for LLMError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LLMError::ApiError(msg) => write!(f, "LLM API error: {}", msg),
            LLMError::RateLimit(msg) => write!(f, "LLM rate limit: {}", msg),
            LLMError::ContextLength(msg) => write!(f, "LLM context too long: {}", msg),
            LLMError::ContentFilter(msg) => write!(f, "Content filtered: {}", msg),
            LLMError::InvalidResponse(msg) => write!(f, "Invalid LLM response: {}", msg),
            LLMError::NetworkError(msg) => write!(f, "LLM network error: {}", msg),
        }
    }
}

impl std::error::Error for LLMError {}

impl LLMError {
    pub fn code(&self) -> ErrorCode {
        match self {
            LLMError::ApiError(_) => ErrorCode::LlmApiError,
            LLMError::RateLimit(_) => ErrorCode::ApiRateLimit,
            LLMError::ContextLength(_) => ErrorCode::LlmContextLength,
            LLMError::ContentFilter(_) => ErrorCode::LlmContentFilter,
            LLMError::NetworkError(_) => ErrorCode::NetworkError,
            _ => ErrorCode::Unknown,
        }
    }
}

/// Application-wide error type
#[derive(Debug)]
pub enum AppError {
    AGI(AGIError),
    Browser(BrowserError),
    Automation(AutomationError),
    MCP(MCPError),
    LLM(LLMError),
    Database(rusqlite::Error),
    Io(std::io::Error),
    Network(String),
    Other(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::AGI(e) => write!(f, "{}", e),
            AppError::Browser(e) => write!(f, "{}", e),
            AppError::Automation(e) => write!(f, "{}", e),
            AppError::MCP(e) => write!(f, "{}", e),
            AppError::LLM(e) => write!(f, "{}", e),
            AppError::Database(e) => write!(f, "Database error: {}", e),
            AppError::Io(e) => write!(f, "IO error: {}", e),
            AppError::Network(msg) => write!(f, "Network error: {}", msg),
            AppError::Other(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for AppError {}

impl AppError {
    pub fn code(&self) -> ErrorCode {
        match self {
            AppError::AGI(e) => e.code(),
            AppError::Browser(e) => e.code(),
            AppError::Automation(e) => e.code(),
            AppError::MCP(e) => e.code(),
            AppError::LLM(e) => e.code(),
            AppError::Database(_) => ErrorCode::DatabaseLocked,
            AppError::Io(_) => ErrorCode::SystemError,
            AppError::Network(_) => ErrorCode::NetworkError,
            AppError::Other(_) => ErrorCode::Unknown,
        }
    }
}

impl From<AGIError> for AppError {
    fn from(err: AGIError) -> Self {
        AppError::AGI(err)
    }
}

impl From<BrowserError> for AppError {
    fn from(err: BrowserError) -> Self {
        AppError::Browser(err)
    }
}

impl From<AutomationError> for AppError {
    fn from(err: AutomationError) -> Self {
        AppError::Automation(err)
    }
}

impl From<MCPError> for AppError {
    fn from(err: MCPError) -> Self {
        AppError::MCP(err)
    }
}

impl From<LLMError> for AppError {
    fn from(err: LLMError) -> Self {
        AppError::LLM(err)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Database(err)
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err)
    }
}

impl From<String> for AppError {
    fn from(err: String) -> Self {
        AppError::Other(err)
    }
}

impl From<&str> for AppError {
    fn from(err: &str) -> Self {
        AppError::Other(err.to_string())
    }
}
