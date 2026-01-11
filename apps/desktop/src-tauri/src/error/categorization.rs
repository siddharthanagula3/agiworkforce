use super::{AGIError, LLMError, ResourceError, ToolError};
use serde::{Deserialize, Serialize};

/// Error category for determining retry and recovery strategies
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ErrorCategory {
    /// Transient errors (network blip, timeout) - retry immediately
    Transient,

    /// Permanent errors (invalid input, not found) - don't retry
    Permanent,

    /// Resource limit errors (out of memory, rate limit) - wait and retry
    ResourceLimit,

    /// Permission errors (access denied) - ask user
    Permission,

    /// Configuration errors (missing API key) - fix config
    Configuration,

    /// Unknown errors - log and fail
    Unknown,
}

/// Trait for categorizing errors and determining recovery strategies
pub trait Categorizable {
    fn category(&self) -> ErrorCategory;
    fn is_retryable(&self) -> bool;
    fn suggested_action(&self) -> String;
    fn retry_delay_ms(&self) -> Option<u64>;
}

impl Categorizable for AGIError {
    fn category(&self) -> ErrorCategory {
        match self {
            AGIError::TransientError(_) => ErrorCategory::Transient,
            AGIError::TimeoutError(_) => ErrorCategory::Transient,
            AGIError::PermissionError(_) => ErrorCategory::Permission,
            AGIError::FatalError(_) => ErrorCategory::Permanent,
            AGIError::ConfigurationError(_) => ErrorCategory::Configuration,
            AGIError::Config(_) => ErrorCategory::Configuration,
            AGIError::Provider(_) => ErrorCategory::Permanent,
            AGIError::Http(_) => ErrorCategory::Transient,
            AGIError::Generic(_) => ErrorCategory::Permanent,
            AGIError::LLMError(e) => e.category(),
            AGIError::ToolError(e) => e.category(),
            AGIError::ResourceError(e) => e.category(),
            AGIError::PlanningError(_) => ErrorCategory::Permanent,
            AGIError::Other(_) => ErrorCategory::Unknown,
            AGIError::Database(_) => ErrorCategory::Transient,
            AGIError::CommandTimeout(_) => ErrorCategory::Transient,
            AGIError::EmailSend(_) => ErrorCategory::Transient,
            AGIError::EmailParse(_) => ErrorCategory::Permanent,
            AGIError::InvalidPath(_) => ErrorCategory::Permanent,
        }
    }

    fn is_retryable(&self) -> bool {
        matches!(
            self.category(),
            ErrorCategory::Transient | ErrorCategory::ResourceLimit
        )
    }

    fn suggested_action(&self) -> String {
        match self.category() {
            ErrorCategory::Transient => {
                "This appears to be a temporary issue. Retrying in a moment...".to_string()
            }
            ErrorCategory::Permanent => {
                "This error cannot be fixed automatically. Please check your input and try again."
                    .to_string()
            }
            ErrorCategory::ResourceLimit => {
                "Resource limit reached. Waiting before retry...".to_string()
            }
            ErrorCategory::Permission => {
                "Permission required. Please grant access to continue.".to_string()
            }
            ErrorCategory::Configuration => {
                "Configuration issue detected. Please check your settings.".to_string()
            }
            ErrorCategory::Unknown => {
                "An unexpected error occurred. Please try again or contact support.".to_string()
            }
        }
    }

    fn retry_delay_ms(&self) -> Option<u64> {
        match self.category() {
            ErrorCategory::Transient => Some(1000),     // 1 second
            ErrorCategory::ResourceLimit => Some(5000), // 5 seconds
            _ => None,
        }
    }
}

impl Categorizable for ToolError {
    fn category(&self) -> ErrorCategory {
        match self {
            ToolError::BrowserError(msg) => {
                if msg.contains("crashed") || msg.contains("Crashed") {
                    ErrorCategory::Permanent
                } else {
                    ErrorCategory::Transient
                }
            }
            ToolError::FileSystemError(msg) => {
                if msg.contains("not found") || msg.contains("Not found") {
                    ErrorCategory::Permanent
                } else if msg.contains("permission") || msg.contains("Permission") {
                    ErrorCategory::Permission
                } else if msg.contains("disk full") || msg.contains("No space") {
                    ErrorCategory::ResourceLimit
                } else {
                    ErrorCategory::Transient
                }
            }
            ToolError::DatabaseError(msg) => {
                if msg.contains("corrupted") || msg.contains("Corrupted") {
                    ErrorCategory::Permanent
                } else {
                    ErrorCategory::Transient
                }
            }
            ToolError::ApiError(msg) => {
                if msg.contains("rate limit") || msg.contains("429") {
                    ErrorCategory::ResourceLimit
                } else if msg.contains("401") || msg.contains("403") {
                    ErrorCategory::Permission
                } else if msg.contains("400") || msg.contains("404") {
                    ErrorCategory::Permanent
                } else {
                    ErrorCategory::Transient
                }
            }
            ToolError::UIAutomationError(msg) => {
                if msg.contains("permission") {
                    ErrorCategory::Permission
                } else {
                    ErrorCategory::Transient
                }
            }
            ToolError::NotFound(_) => ErrorCategory::Permanent,
            ToolError::InvalidParameters(_) => ErrorCategory::Permanent,
            _ => ErrorCategory::Transient,
        }
    }

    fn is_retryable(&self) -> bool {
        matches!(
            self.category(),
            ErrorCategory::Transient | ErrorCategory::ResourceLimit
        )
    }

    fn suggested_action(&self) -> String {
        match self {
            ToolError::BrowserError(msg) => {
                if msg.contains("element not found") {
                    "UI element not found. Retrying with alternative selectors...".to_string()
                } else {
                    "Browser automation issue. Retrying...".to_string()
                }
            }
            ToolError::FileSystemError(msg) => {
                if msg.contains("not found") {
                    "File not found. Please check the path.".to_string()
                } else if msg.contains("permission") {
                    "Permission denied. Please grant file access.".to_string()
                } else {
                    "File system error. Retrying...".to_string()
                }
            }
            ToolError::DatabaseError(_) => "Database error. Retrying...".to_string(),
            ToolError::ApiError(msg) => {
                if msg.contains("rate limit") {
                    "API rate limit reached. Waiting before retry...".to_string()
                } else {
                    "API call failed. Retrying...".to_string()
                }
            }
            ToolError::NotFound(tool) => format!(
                "Tool '{}' not found. Please check the tool name or install the required tool.",
                tool
            ),
            ToolError::InvalidParameters(msg) => {
                format!("Invalid parameters: {}. Please check your input.", msg)
            }
            _ => "Tool execution failed. Retrying...".to_string(),
        }
    }

    fn retry_delay_ms(&self) -> Option<u64> {
        match self.category() {
            ErrorCategory::Transient => Some(1000),
            ErrorCategory::ResourceLimit => Some(5000),
            _ => None,
        }
    }
}

impl Categorizable for LLMError {
    fn category(&self) -> ErrorCategory {
        match self {
            LLMError::RateLimitError(_) => ErrorCategory::ResourceLimit,
            LLMError::ContextLengthError(_) => ErrorCategory::Configuration,
            LLMError::ContentFilterError(_) => ErrorCategory::Permanent,
            LLMError::ApiError(_) => ErrorCategory::Transient,
            LLMError::NetworkError(_) => ErrorCategory::Transient,
            LLMError::InvalidResponse(_) => ErrorCategory::Transient,
            LLMError::ModelNotAvailable(_) => ErrorCategory::Configuration,
            LLMError::AuthenticationError(_) => ErrorCategory::Configuration,
            LLMError::Timeout(_) => ErrorCategory::Transient,
        }
    }

    fn is_retryable(&self) -> bool {
        matches!(
            self.category(),
            ErrorCategory::Transient | ErrorCategory::ResourceLimit
        )
    }

    fn suggested_action(&self) -> String {
        match self {
            LLMError::RateLimitError(_) => {
                "LLM rate limit exceeded. Waiting before retry or switching to alternative provider...".to_string()
            }
            LLMError::ContextLengthError(_) => {
                "Context too long. Please reduce input size or use a model with larger context window.".to_string()
            }
            LLMError::ContentFilterError(_) => {
                "Content filtered by LLM provider. Please rephrase your input.".to_string()
            }
            LLMError::NetworkError(_) => "Network error connecting to LLM. Retrying...".to_string(),
            LLMError::ModelNotAvailable(_) => {
                "LLM model not available. Please check your configuration or choose a different model.".to_string()
            }
            LLMError::AuthenticationError(_) => {
                "LLM authentication failed. Please check your API key.".to_string()
            }
            LLMError::Timeout(_) => "LLM request timed out. Retrying...".to_string(),
            _ => "LLM error occurred. Retrying...".to_string(),
        }
    }

    fn retry_delay_ms(&self) -> Option<u64> {
        match self {
            LLMError::RateLimitError(_) => Some(10000), // 10 seconds for rate limit
            LLMError::Timeout(_) => Some(2000),         // 2 seconds for timeout
            LLMError::NetworkError(_) => Some(1000),    // 1 second for network
            LLMError::ApiError(_) => Some(2000),        // 2 seconds for API errors
            _ => None,
        }
    }
}

impl Categorizable for ResourceError {
    fn category(&self) -> ErrorCategory {
        ErrorCategory::ResourceLimit
    }

    fn is_retryable(&self) -> bool {
        true
    }

    fn suggested_action(&self) -> String {
        match self {
            ResourceError::CpuLimitExceeded(_) => {
                "CPU limit exceeded. Reducing workload and retrying...".to_string()
            }
            ResourceError::MemoryLimitExceeded(_) => {
                "Memory limit exceeded. Clearing caches and retrying...".to_string()
            }
            ResourceError::NetworkLimitExceeded(_) => {
                "Network limit exceeded. Waiting before retry...".to_string()
            }
            ResourceError::StorageLimitExceeded(_) => {
                "Storage limit exceeded. Please free up disk space.".to_string()
            }
            ResourceError::ConcurrencyLimitExceeded(_) => {
                "Too many concurrent operations. Waiting for resources...".to_string()
            }
        }
    }

    fn retry_delay_ms(&self) -> Option<u64> {
        match self {
            ResourceError::MemoryLimitExceeded(_) => Some(5000), // Wait for GC
            ResourceError::CpuLimitExceeded(_) => Some(3000),
            ResourceError::NetworkLimitExceeded(_) => Some(5000),
            ResourceError::ConcurrencyLimitExceeded(_) => Some(2000),
            ResourceError::StorageLimitExceeded(_) => None, // Manual intervention needed
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_error_categorization() {
        let error = ToolError::BrowserError("element not found".to_string());
        assert_eq!(error.category(), ErrorCategory::Transient);
        assert!(error.is_retryable());

        let error = ToolError::NotFound("missing_tool".to_string());
        assert_eq!(error.category(), ErrorCategory::Permanent);
        assert!(!error.is_retryable());
    }

    #[test]
    fn test_llm_error_categorization() {
        let error = LLMError::RateLimitError("too many requests".to_string());
        assert_eq!(error.category(), ErrorCategory::ResourceLimit);
        assert!(error.is_retryable());
        assert_eq!(error.retry_delay_ms(), Some(10000));

        let error = LLMError::ContentFilterError("inappropriate content".to_string());
        assert_eq!(error.category(), ErrorCategory::Permanent);
        assert!(!error.is_retryable());
    }

    #[test]
    fn test_resource_error_categorization() {
        let error = ResourceError::MemoryLimitExceeded("out of memory".to_string());
        assert_eq!(error.category(), ErrorCategory::ResourceLimit);
        assert!(error.is_retryable());
        assert_eq!(error.retry_delay_ms(), Some(5000));
    }

    #[test]
    fn test_agi_error_suggested_actions() {
        let error = AGIError::TransientError("network timeout".to_string());
        assert!(error.suggested_action().contains("temporary"));

        let error = AGIError::PermissionError("access denied".to_string());
        assert!(error.suggested_action().contains("Permission"));
    }
}
