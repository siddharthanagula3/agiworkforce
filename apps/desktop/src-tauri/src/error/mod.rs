use serde::{Deserialize, Serialize};
use std::fmt;
use thiserror::Error;

pub mod categorization;
pub mod commands;
pub mod integration;
pub mod recovery;
pub mod retry;

pub use categorization::{Categorizable, ErrorCategory};
pub use commands::{ErrorContextResponse, ErrorContextStore};
pub use integration::{
    convert_tool_error, emit_error_event, execute_tool_with_recovery, EnhancedExecutionContext,
};
pub use recovery::{RecoveryAction, RecoveryManager, RecoveryStrategy};
pub use retry::{retry_with_policy, BackoffStrategy, RetryPolicy};

/// Main AGI error type hierarchy
#[derive(Debug, Error, Serialize, Deserialize, Clone)]
#[serde(tag = "type", content = "details")]
pub enum AGIError {
    #[error("Tool execution failed: {0}")]
    ToolError(#[from] ToolError),

    #[error("Planning failed: {0}")]
    PlanningError(String),

    #[error("LLM error: {0}")]
    LLMError(#[from] LLMError),

    #[error("Resource error: {0}")]
    ResourceError(#[from] ResourceError),

    #[error("Permission denied: {0}")]
    PermissionError(String),

    #[error("Transient error: {0}")]
    TransientError(String), // Retryable

    #[error("Fatal error: {0}")]
    FatalError(String), // Not retryable

    #[error("Configuration error: {0}")]
    ConfigurationError(String),

    #[error("Config error: {0}")]
    Config(String),

    #[error("Timeout error: {0}")]
    TimeoutError(String),

    #[error("Provider error: {0}")]
    Provider(String),

    #[error("HTTP error: {0}")]
    Http(String),

    #[error("Generic error: {0}")]
    Generic(String),
}

/// Tool-specific errors
#[derive(Debug, Error, Serialize, Deserialize, Clone)]
#[serde(tag = "tool_type", content = "message")]
pub enum ToolError {
    #[error("Browser automation failed: {0}")]
    BrowserError(String),

    #[error("File system error: {0}")]
    FileSystemError(String),

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("API call failed: {0}")]
    ApiError(String),

    #[error("UI automation failed: {0}")]
    UIAutomationError(String),

    #[error("Email operation failed: {0}")]
    EmailError(String),

    #[error("Calendar operation failed: {0}")]
    CalendarError(String),

    #[error("Cloud storage error: {0}")]
    CloudError(String),

    #[error("Code execution failed: {0}")]
    CodeExecutionError(String),

    #[error("OCR failed: {0}")]
    OCRError(String),

    #[error("Tool not found: {0}")]
    NotFound(String),

    #[error("Invalid parameters: {0}")]
    InvalidParameters(String),
}

/// LLM-specific errors
#[derive(Debug, Error, Serialize, Deserialize, Clone)]
#[serde(tag = "llm_error_type", content = "message")]
pub enum LLMError {
    #[error("Rate limit exceeded: {0}")]
    RateLimitError(String),

    #[error("Context length exceeded: {0}")]
    ContextLengthError(String),

    #[error("Content filtered: {0}")]
    ContentFilterError(String),

    #[error("API error: {0}")]
    ApiError(String),

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("Invalid response: {0}")]
    InvalidResponse(String),

    #[error("Model not available: {0}")]
    ModelNotAvailable(String),

    #[error("Authentication failed: {0}")]
    AuthenticationError(String),

    #[error("Timeout: {0}")]
    Timeout(String),
}

/// Resource-related errors
#[derive(Debug, Error, Serialize, Deserialize, Clone)]
#[serde(tag = "resource_type", content = "message")]
pub enum ResourceError {
    #[error("CPU limit exceeded: {0}")]
    CpuLimitExceeded(String),

    #[error("Memory limit exceeded: {0}")]
    MemoryLimitExceeded(String),

    #[error("Network limit exceeded: {0}")]
    NetworkLimitExceeded(String),

    #[error("Storage limit exceeded: {0}")]
    StorageLimitExceeded(String),

    #[error("Too many concurrent operations: {0}")]
    ConcurrencyLimitExceeded(String),
}

/// Detailed error context for tracking and debugging
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorContext {
    pub id: String,
    pub error: AGIError,
    pub timestamp: i64,
    pub step: Option<String>,
    pub tool: Option<String>,
    pub input: Option<serde_json::Value>,
    pub stacktrace: Vec<String>,
    pub recovery_attempts: u32,
    pub user_message: String, // Friendly message for users
    pub category: ErrorCategory,
    pub suggested_action: String,
}

impl ErrorContext {
    pub fn new(error: AGIError) -> Self {
        let category = error.category();
        let user_message = error.suggested_action();
        let suggested_action = user_message.clone();

        Self {
            id: uuid::Uuid::new_v4().to_string(),
            error,
            timestamp: chrono::Utc::now().timestamp(),
            step: None,
            tool: None,
            input: None,
            stacktrace: vec![],
            recovery_attempts: 0,
            user_message,
            category,
            suggested_action,
        }
    }

    pub fn with_step(mut self, step: String) -> Self {
        self.stacktrace.push(format!("Step: {}", step));
        self.step = Some(step);
        self
    }

    pub fn with_tool(mut self, tool: String) -> Self {
        self.stacktrace.push(format!("Tool: {}", tool));
        self.tool = Some(tool);
        self
    }

    pub fn with_input(mut self, input: serde_json::Value) -> Self {
        self.input = Some(input);
        self
    }

    pub fn with_stacktrace(mut self, trace: String) -> Self {
        self.stacktrace.push(trace);
        self
    }

    pub fn increment_recovery_attempts(&mut self) {
        self.recovery_attempts += 1;
    }
}

/// Error type alias for compatibility
pub type Error = AGIError;

/// Result type alias for AGI operations
pub type Result<T> = std::result::Result<T, AGIError>;

/// Convert from anyhow::Error to AGIError
impl From<anyhow::Error> for AGIError {
    fn from(err: anyhow::Error) -> Self {
        AGIError::FatalError(err.to_string())
    }
}

/// Convert from std::io::Error to AGIError
impl From<std::io::Error> for AGIError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => AGIError::ToolError(ToolError::FileSystemError(
                format!("File not found: {}", err),
            )),
            std::io::ErrorKind::PermissionDenied => AGIError::PermissionError(err.to_string()),
            std::io::ErrorKind::TimedOut => AGIError::TimeoutError(err.to_string()),
            std::io::ErrorKind::WouldBlock => AGIError::TransientError(err.to_string()),
            _ => AGIError::ToolError(ToolError::FileSystemError(err.to_string())),
        }
    }
}

/// Convert from reqwest::Error to AGIError
impl From<reqwest::Error> for AGIError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            AGIError::TimeoutError(err.to_string())
        } else if err.is_connect() {
            AGIError::LLMError(LLMError::NetworkError(err.to_string()))
        } else if err.status() == Some(reqwest::StatusCode::TOO_MANY_REQUESTS) {
            AGIError::LLMError(LLMError::RateLimitError(err.to_string()))
        } else {
            AGIError::LLMError(LLMError::ApiError(err.to_string()))
        }
    }
}

/// Convert from serde_json::Error to AGIError
impl From<serde_json::Error> for AGIError {
    fn from(err: serde_json::Error) -> Self {
        AGIError::ConfigurationError(format!("JSON error: {}", err))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_context_creation() {
        let error = AGIError::TransientError("Network timeout".to_string());
        let context = ErrorContext::new(error)
            .with_step("Execute API call".to_string())
            .with_tool("api_call".to_string());

        assert_eq!(context.step, Some("Execute API call".to_string()));
        assert_eq!(context.tool, Some("api_call".to_string()));
        assert_eq!(context.recovery_attempts, 0);
        assert_eq!(context.stacktrace.len(), 2);
    }

    #[test]
    fn test_error_category() {
        let error = AGIError::TransientError("test".to_string());
        assert!(matches!(error.category(), ErrorCategory::Transient));

        let error = AGIError::PermissionError("test".to_string());
        assert!(matches!(error.category(), ErrorCategory::Permission));

        let error = AGIError::FatalError("test".to_string());
        assert!(matches!(error.category(), ErrorCategory::Permanent));
    }

    #[test]
    fn test_error_is_retryable() {
        let error = AGIError::TransientError("test".to_string());
        assert!(error.is_retryable());

        let error = AGIError::FatalError("test".to_string());
        assert!(!error.is_retryable());

        let error = AGIError::ResourceError(ResourceError::MemoryLimitExceeded("test".to_string()));
        assert!(error.is_retryable());
    }
}
