use super::{
    retry_with_policy, AGIError, ErrorContext, RecoveryManager, Result, RetryPolicy, ToolError,
};
use std::sync::Arc;

pub async fn execute_tool_with_recovery<F, Fut, T>(
    tool_name: &str,
    operation: F,
    recovery_manager: &RecoveryManager,
) -> Result<T>
where
    F: Fn() -> Fut + Clone,
    Fut: std::future::Future<Output = Result<T>>,
{
    let policy = match tool_name {
        "browser_navigate" | "browser_click" | "browser_extract" => RetryPolicy::browser(),
        "api_call" | "api_upload" | "api_download" => RetryPolicy::network(),
        "db_query" | "db_execute" => RetryPolicy::database(),
        "file_read" | "file_write" => RetryPolicy::filesystem(),
        "llm_reason" => RetryPolicy::llm(),
        _ => RetryPolicy::default(),
    };

    let result = retry_with_policy(&policy, operation.clone()).await;

    match result {
        Ok(value) => Ok(value),
        Err(error) => {
            tracing::warn!("Tool '{}' failed after retries: {}", tool_name, error);

            let context = ErrorContext::new(error.clone())
                .with_tool(tool_name.to_string())
                .with_stacktrace(format!("Tool execution failed: {}", tool_name));

            tracing::debug!("Error context: {:?}", context);

            match recovery_manager.recover(&error).await {
                Ok(recovery_action) => {
                    tracing::info!("Recovery action: {:?}", recovery_action);
                    Err(error)
                }
                Err(recovery_error) => {
                    tracing::error!("Recovery failed: {}", recovery_error);
                    Err(error)
                }
            }
        }
    }
}

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
        "cloud_upload" | "cloud_download" => AGIError::ToolError(ToolError::CloudError(error_msg)),
        "code_execute" => AGIError::ToolError(ToolError::CodeExecutionError(error_msg)),
        "image_ocr" => AGIError::ToolError(ToolError::OCRError(error_msg)),
        _ => AGIError::ToolError(ToolError::BrowserError(error_msg)),
    }
}

pub struct EnhancedExecutionContext {
    pub recovery_manager: Arc<RecoveryManager>,
    pub max_recovery_attempts: u32,
}

impl EnhancedExecutionContext {
    pub fn new() -> Self {
        Self {
            recovery_manager: Arc::new(RecoveryManager::new()),
            max_recovery_attempts: 3,
        }
    }

    pub async fn execute_step_with_recovery<F, Fut, T>(
        &self,
        tool_name: &str,
        operation: F,
    ) -> Result<T>
    where
        F: Fn() -> Fut + Clone,
        Fut: std::future::Future<Output = Result<T>>,
    {
        execute_tool_with_recovery(tool_name, operation, &self.recovery_manager).await
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
        let result = execute_tool_with_recovery("test_tool", operation, &recovery_manager).await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "success");
    }

    #[tokio::test]
    async fn test_enhanced_execution_context() {
        let ctx = EnhancedExecutionContext::new();

        let operation = || async { Ok::<_, AGIError>("test".to_string()) };

        let result = ctx.execute_step_with_recovery("test_tool", operation).await;

        assert!(result.is_ok());
    }
}
