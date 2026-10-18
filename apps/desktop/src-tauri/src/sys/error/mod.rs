use serde::{Deserialize, Serialize};
use thiserror::Error;

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
    TransientError(String),

    #[error("Fatal error: {0}")]
    FatalError(String),

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

    #[error("Other error: {0}")]
    Other(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Command timed out: {0}")]
    CommandTimeout(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),
}

impl From<rusqlite::Error> for AGIError {
    fn from(err: rusqlite::Error) -> Self {
        AGIError::Database(err.to_string())
    }
}

#[cfg(feature = "remote-databases")]
impl From<tokio_postgres::Error> for AGIError {
    fn from(err: tokio_postgres::Error) -> Self {
        AGIError::Database(err.to_string())
    }
}

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

pub type Error = AGIError;

pub type Result<T> = std::result::Result<T, AGIError>;

impl From<anyhow::Error> for AGIError {
    fn from(err: anyhow::Error) -> Self {
        AGIError::FatalError(err.to_string())
    }
}

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

impl From<serde_json::Error> for AGIError {
    fn from(err: serde_json::Error) -> Self {
        AGIError::ConfigurationError(format!("JSON error: {}", err))
    }
}
