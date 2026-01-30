//! Error types for the intent detection module.

use thiserror::Error;

/// Errors that can occur during intent detection and tool routing.
#[derive(Error, Debug)]
pub enum IntentError {
    /// Failed to parse the user prompt.
    #[error("Failed to parse prompt: {0}")]
    ParseError(String),

    /// No matching intent pattern found.
    #[error("No matching intent found for prompt")]
    NoMatchingIntent,

    /// No suitable tools available for the detected intent.
    #[error("No tools available for intent: {0}")]
    NoToolsAvailable(String),

    /// MCP server required but not available.
    #[error("Required MCP server not available: {0}")]
    McpServerUnavailable(String),

    /// Tool routing failed.
    #[error("Tool routing failed: {0}")]
    RoutingError(String),

    /// Intent confidence too low.
    #[error("Intent confidence too low: {0:.2}")]
    LowConfidence(f64),

    /// Internal error.
    #[error("Internal intent detection error: {0}")]
    Internal(String),

    /// LLM-based detection failed.
    #[error("LLM intent detection failed: {0}")]
    LlmError(String),
}

/// Result type for intent operations.
pub type IntentResult<T> = Result<T, IntentError>;
