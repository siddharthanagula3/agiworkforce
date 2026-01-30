//! Hook system error types.
//!
//! Defines all error types that can occur during hook configuration,
//! matching, and execution.

use std::io;
use thiserror::Error;

/// Errors that can occur in the hooks system.
#[derive(Error, Debug)]
pub enum HookError {
    /// Failed to parse hook configuration.
    #[error("Hook configuration error: {0}")]
    Configuration(String),

    /// Invalid regex pattern in matcher.
    #[error("Invalid matcher pattern '{pattern}': {reason}")]
    InvalidMatcher { pattern: String, reason: String },

    /// Hook execution failed.
    #[error("Hook execution failed for event {event}: {reason}")]
    ExecutionFailed { event: String, reason: String },

    /// Hook command timed out.
    #[error("Hook command timed out after {timeout_ms}ms: {command}")]
    Timeout { command: String, timeout_ms: u64 },

    /// Failed to spawn hook process.
    #[error("Failed to spawn hook process: {0}")]
    SpawnFailed(#[from] io::Error),

    /// Hook command returned non-zero exit code.
    #[error("Hook command exited with code {code}: {stderr}")]
    NonZeroExit { code: i32, stderr: String },

    /// JSON serialization/deserialization error.
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// Hook is disabled.
    #[error("Hook is disabled: {0}")]
    Disabled(String),

    /// Settings error when loading hook configuration.
    #[error("Settings error: {0}")]
    Settings(String),

    /// Working directory does not exist or is inaccessible.
    #[error("Invalid working directory '{path}': {reason}")]
    InvalidWorkingDirectory { path: String, reason: String },

    /// Hook execution was cancelled.
    #[error("Hook execution cancelled: {0}")]
    Cancelled(String),
}

/// Result type for hook operations.
pub type HookResult<T> = Result<T, HookError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = HookError::Configuration("missing hooks field".to_string());
        assert!(err.to_string().contains("missing hooks field"));

        let err = HookError::InvalidMatcher {
            pattern: "[invalid".to_string(),
            reason: "unclosed bracket".to_string(),
        };
        assert!(err.to_string().contains("[invalid"));
        assert!(err.to_string().contains("unclosed bracket"));

        let err = HookError::Timeout {
            command: "slow-script.sh".to_string(),
            timeout_ms: 5000,
        };
        assert!(err.to_string().contains("5000ms"));
        assert!(err.to_string().contains("slow-script.sh"));
    }

    #[test]
    fn test_error_from_io() {
        let io_err = io::Error::new(io::ErrorKind::NotFound, "file not found");
        let hook_err: HookError = io_err.into();
        assert!(matches!(hook_err, HookError::SpawnFailed(_)));
    }

    #[test]
    fn test_error_from_json() {
        let json_err = serde_json::from_str::<String>("invalid").unwrap_err();
        let hook_err: HookError = json_err.into();
        assert!(matches!(hook_err, HookError::Json(_)));
    }
}
