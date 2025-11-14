/// This module provides integration examples for enhanced error handling
/// with the AGI executor, tools, and router.

use super::{
    retry_with_policy, AGIError, Categorizable, ErrorContext, RecoveryManager, Result,
    RetryPolicy, ToolError,
};
use std::sync::Arc;

/// Example: Wrap tool execution with retry and recovery
pub async fn execute_tool_with_recovery<F, Fut, T>(
    tool_name: &str,
    operation: F,
    recovery_manager: &RecoveryManager,
) -> Result<T>
where
    F: Fn() -> Fut + Clone,
    Fut: std::future::Future<Output = Result<T>>,
{
    // Select appropriate retry policy based on tool type
    let policy = match tool_name {
        "browser_navigate" | "browser_click" | "browser_extract" => RetryPolicy::browser(),
        "api_call" | "api_upload" | "api_download" => RetryPolicy::network(),
        "db_query" | "db_execute" => RetryPolicy::database(),
        "file_read" | "file_write" => RetryPolicy::filesystem(),
        "llm_reason" => RetryPolicy::llm(),
        _ => RetryPolicy::default(),
    };

    // Attempt with retry
    let result = retry_with_policy(&policy, operation.clone()).await;

    // If still failed, attempt recovery
    match result {
        Ok(value) => Ok(value),
        Err(error) => {
            tracing::warn!("Tool '{}' failed after retries: {}", tool_name, error);

            // Create error context for tracking
            let context = ErrorContext::new(error.clone())
                .with_tool(tool_name.to_string())
                .with_stacktrace(format!("Tool execution failed: {}", tool_name));

            tracing::debug!("Error context: {:?}", context);

            // Attempt recovery
            match recovery_manager.recover(&error).await {
                Ok(recovery_action) => {
                    tracing::info!("Recovery action: {:?}", recovery_action);
                    Err(error) // Return original error with recovery info
                }
                Err(recovery_error) => {
                    tracing::error!("Recovery failed: {}", recovery_error);
                    Err(error)
                }
            }
        }
    }
}

/// Example: Convert tool execution errors to AGI errors
pub fn convert_tool_error(tool_name: &str, error: impl std::error::Error) -> AGIError {
    let error_msg = error.to_string();

    match tool_name {
        "browser_navigate" | "browser_click" | "browser_extract" => {
            AGIError::ToolError(ToolError::BrowserError(error_msg))
        }
        "api_call" | "api_upload" | "api_download" => {
            AGIError::ToolError(ToolError::ApiError(error_msg))
        }
        "db_query" | "db_execute" => AGIError::ToolError(ToolError::DatabaseError(error_msg)),
        "file_read" | "file_write" => AGIError::ToolError(ToolError::FileSystemError(error_msg)),
        "ui_screenshot" | "ui_click" | "ui_type" => {
            AGIError::ToolError(ToolError::UIAutomationError(error_msg))
        }
        "email_send" | "email_fetch" => AGIError::ToolError(ToolError::EmailError(error_msg)),
        "calendar_create_event" | "calendar_list_events" => {
            AGIError::ToolError(ToolError::CalendarError(error_msg))
        }
        "cloud_upload" | "cloud_download" => {
            AGIError::ToolError(ToolError::CloudError(error_msg))
        }
        "code_execute" => AGIError::ToolError(ToolError::CodeExecutionError(error_msg)),
        "image_ocr" => AGIError::ToolError(ToolError::OCRError(error_msg)),
        _ => AGIError::ToolError(ToolError::BrowserError(error_msg)),
    }
}

/// Example: Emit error events to frontend
pub async fn emit_error_event(
    app_handle: &tauri::AppHandle,
    error_context: &ErrorContext,
) -> Result<()> {
    use serde_json::json;

    let payload = json!({
        "error_id": error_context.id,
        "error_type": format!("{:?}", error_context.error),
        "message": error_context.error.to_string(),
        "category": format!("{:?}", error_context.category),
        "is_retryable": error_context.error.is_retryable(),
        "user_message": error_context.user_message,
        "suggested_action": error_context.suggested_action,
        "step": error_context.step,
        "tool": error_context.tool,
        "recovery_attempts": error_context.recovery_attempts,
        "timestamp": error_context.timestamp,
    });

    app_handle
        .emit("agi:error", payload)
        .map_err(|e| AGIError::FatalError(format!("Failed to emit error event: {}", e)))?;

    Ok(())
}

/// Example: Enhanced executor step execution with error handling
pub struct EnhancedExecutionContext {
    pub recovery_manager: Arc<RecoveryManager>,
    pub app_handle: Option<tauri::AppHandle>,
    pub max_recovery_attempts: u32,
}

impl EnhancedExecutionContext {
    pub fn new() -> Self {
        Self {
            recovery_manager: Arc::new(RecoveryManager::new()),
            app_handle: None,
            max_recovery_attempts: 3,
        }
    }

    pub fn with_app_handle(mut self, app_handle: tauri::AppHandle) -> Self {
        self.app_handle = Some(app_handle);
        self
    }

    /// Execute a step with full error handling
    pub async fn execute_step_with_recovery<F, Fut, T>(
        &self,
        step_name: &str,
        tool_name: &str,
        operation: F,
    ) -> Result<T>
    where
        F: Fn() -> Fut + Clone,
        Fut: std::future::Future<Output = Result<T>>,
    {
        let result =
            execute_tool_with_recovery(tool_name, operation, &self.recovery_manager).await;

        // If error occurred, create context and emit event
        if let Err(ref error) = result {
            let context = ErrorContext::new(error.clone())
                .with_step(step_name.to_string())
                .with_tool(tool_name.to_string());

            if let Some(ref app_handle) = self.app_handle {
                let _ = emit_error_event(app_handle, &context).await;
            }
        }

        result
    }
}

impl Default for EnhancedExecutionContext {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_convert_tool_error() {
        let error = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let agi_error = convert_tool_error("file_read", error);

        assert!(matches!(
            agi_error,
            AGIError::ToolError(ToolError::FileSystemError(_))
        ));
    }

    #[tokio::test]
    async fn test_execute_tool_with_recovery_success() {
        use std::sync::atomic::{AtomicU32, Ordering};
        use std::sync::Arc;

        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let operation = move || {
            let counter = counter_clone.clone();
            async move {
                let count = counter.fetch_add(1, Ordering::SeqCst);
                if count < 1 {
                    Err(AGIError::TransientError("temporary failure".to_string()))
                } else {
                    Ok("success".to_string())
                }
            }
        };

        let recovery_manager = RecoveryManager::new();
        let result =
            execute_tool_with_recovery("test_tool", operation, &recovery_manager).await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "success");
    }

    #[tokio::test]
    async fn test_enhanced_execution_context() {
        let ctx = EnhancedExecutionContext::new();

        let operation = || async { Ok::<_, AGIError>("test".to_string()) };

        let result = ctx
            .execute_step_with_recovery("test_step", "test_tool", operation)
            .await;

        assert!(result.is_ok());
    }
}
