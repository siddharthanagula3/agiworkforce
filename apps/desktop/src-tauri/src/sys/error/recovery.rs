use super::{AGIError, LLMError, Result, ToolError};
use serde::{Deserialize, Serialize};
use std::future::Future;
use std::pin::Pin;
use tracing::{debug, info, warn};

type RecoveryHandler =
    dyn Fn(&AGIError) -> Pin<Box<dyn Future<Output = Result<RecoveryAction>> + Send>> + Send + Sync;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RecoveryAction {
    Retry,

    Fallback(String),

    Skip,

    Abort,

    RequestUserInput(String),

    WaitAndRetry(u64),
}

pub struct RecoveryStrategy {
    pub name: String,
    pub condition: Box<dyn Fn(&AGIError) -> bool + Send + Sync>,
    pub handler: Box<RecoveryHandler>,
}

impl RecoveryStrategy {
    pub fn new<F, Fut>(
        name: impl Into<String>,
        condition: F,
        handler: impl Fn(&AGIError) -> Fut + Send + Sync + 'static,
    ) -> Self
    where
        F: Fn(&AGIError) -> bool + Send + Sync + 'static,
        Fut: Future<Output = Result<RecoveryAction>> + Send + 'static,
    {
        Self {
            name: name.into(),
            condition: Box::new(condition),
            handler: Box::new(move |error| Box::pin(handler(error))),
        }
    }
}

pub struct RecoveryManager {
    strategies: Vec<RecoveryStrategy>,
}

impl RecoveryManager {
    pub fn new() -> Self {
        let mut manager = Self { strategies: vec![] };

        manager.register_browser_recovery();
        manager.register_llm_recovery();
        manager.register_file_recovery();
        manager.register_api_recovery();
        manager.register_resource_recovery();
        manager.register_permission_recovery();

        manager
    }

    pub fn register_strategy(&mut self, strategy: RecoveryStrategy) {
        self.strategies.push(strategy);
    }

    fn register_browser_recovery(&mut self) {
        self.strategies.push(RecoveryStrategy::new(
            "Browser element not found recovery",
            |e| matches!(e, AGIError::ToolError(ToolError::BrowserError(msg)) if msg.contains("element not found")),
            |_e| async move {
                info!("Attempting browser element recovery");





                Ok(RecoveryAction::Fallback(
                    "Using semantic selector fallback".to_string(),
                ))
            },
        ));

        self.strategies.push(RecoveryStrategy::new(
            "Browser crash recovery",
            |e| matches!(e, AGIError::ToolError(ToolError::BrowserError(msg)) if msg.contains("crash")),
            |_| async move {
                warn!("Browser crashed, will restart");
                Ok(RecoveryAction::Fallback("Restart browser".to_string()))
            },
        ));

        self.strategies.push(RecoveryStrategy::new(
            "Browser timeout recovery",
            |e| matches!(e, AGIError::ToolError(ToolError::BrowserError(msg)) if msg.contains("timeout")),
            |_| async move {
                debug!("Browser timeout, retrying with increased timeout");
                Ok(RecoveryAction::WaitAndRetry(5000))
            },
        ));
    }

    fn register_llm_recovery(&mut self) {
        self.strategies.push(RecoveryStrategy::new(
            "LLM rate limit recovery",
            |e| matches!(e, AGIError::LLMError(LLMError::RateLimitError(_))),
            |_| async move {
                info!("Rate limit hit, switching to alternative provider or waiting");

                Ok(RecoveryAction::Fallback(
                    "Switch to alternative LLM provider".to_string(),
                ))
            },
        ));

        self.strategies.push(RecoveryStrategy::new(
            "LLM context length recovery",
            |e| matches!(e, AGIError::LLMError(LLMError::ContextLengthError(_))),
            |_| async move {
                info!("Context too long, attempting to summarize");
                Ok(RecoveryAction::Fallback("Summarize context".to_string()))
            },
        ));

        self.strategies.push(RecoveryStrategy::new(
            "LLM timeout recovery",
            |e| matches!(e, AGIError::LLMError(LLMError::Timeout(_))),
            |_| async move {
                debug!("LLM timeout, retrying with increased timeout");
                Ok(RecoveryAction::WaitAndRetry(10000))
            },
        ));

        self.strategies.push(RecoveryStrategy::new(
            "LLM model not available recovery",
            |e| matches!(e, AGIError::LLMError(LLMError::ModelNotAvailable(_))),
            |_| async move {
                info!("Model not available, switching to fallback model");
                Ok(RecoveryAction::Fallback(
                    "Switch to fallback model".to_string(),
                ))
            },
        ));
    }

    fn register_file_recovery(&mut self) {
        self.strategies.push(RecoveryStrategy::new(
            "File not found recovery",
            |e| matches!(e, AGIError::ToolError(ToolError::FileSystemError(msg)) if msg.contains("not found")),
            |e| {

                let error_msg = match e {
                    AGIError::ToolError(ToolError::FileSystemError(msg)) => msg.clone(),
                    _ => String::new(),
                };
                async move {
                    if !error_msg.is_empty() {
                        info!("File not found: {}", error_msg);
                        Ok(RecoveryAction::RequestUserInput(format!(
                            "File not found. Please provide the correct path: {}",
                            error_msg
                        )))
                    } else {
                        Ok(RecoveryAction::Abort)
                    }
                }
            },
        ));

        self.strategies.push(RecoveryStrategy::new(
            "Disk full recovery",
            |e| matches!(e, AGIError::ToolError(ToolError::FileSystemError(msg)) if msg.contains("disk full") || msg.contains("No space")),
            |_| async move {
                warn!("Disk full, requesting cleanup");
                Ok(RecoveryAction::RequestUserInput(
                    "Disk full. Please free up disk space and try again.".to_string(),
                ))
            },
        ));
    }

    fn register_api_recovery(&mut self) {
        self.strategies.push(RecoveryStrategy::new(
            "API rate limit recovery",
            |e| matches!(e, AGIError::ToolError(ToolError::ApiError(msg)) if msg.contains("rate limit") || msg.contains("429")),
            |_| async move {
                info!("API rate limit, waiting before retry");
                Ok(RecoveryAction::WaitAndRetry(60000))
            },
        ));

        self.strategies.push(RecoveryStrategy::new(
            "API timeout recovery",
            |e| matches!(e, AGIError::ToolError(ToolError::ApiError(msg)) if msg.contains("timeout")),
            |_| async move {
                debug!("API timeout, retrying");
                Ok(RecoveryAction::WaitAndRetry(3000))
            },
        ));

        self.strategies.push(RecoveryStrategy::new(
            "API authentication recovery",
            |e| matches!(e, AGIError::ToolError(ToolError::ApiError(msg)) if msg.contains("401") || msg.contains("403")),
            |_| async move {
                warn!("API authentication failed");
                Ok(RecoveryAction::RequestUserInput(
                    "API authentication failed. Please check your API credentials.".to_string(),
                ))
            },
        ));
    }

    fn register_resource_recovery(&mut self) {
        self.strategies.push(RecoveryStrategy::new(
            "Memory limit recovery",
            |e| matches!(e, AGIError::ResourceError(_)),
            |e| {
                let error_msg = e.to_string();
                async move {
                    info!("Resource limit hit, attempting recovery: {}", error_msg);

                    Ok(RecoveryAction::Fallback(
                        "Clear caches and reduce workload".to_string(),
                    ))
                }
            },
        ));
    }

    fn register_permission_recovery(&mut self) {
        self.strategies.push(RecoveryStrategy::new(
            "Permission denied recovery",
            |e| matches!(e, AGIError::PermissionError(_)),
            |e| {
                let error_msg = e.to_string();
                async move {
                    warn!("Permission denied: {}", error_msg);
                    Ok(RecoveryAction::RequestUserInput(format!(
                        "Permission denied. Please grant the required permissions: {}",
                        error_msg
                    )))
                }
            },
        ));
    }

    pub async fn recover(&self, error: &AGIError) -> Result<RecoveryAction> {
        for strategy in &self.strategies {
            if (strategy.condition)(error) {
                debug!("Applying recovery strategy: {}", strategy.name);
                match (strategy.handler)(error).await {
                    Ok(action) => {
                        info!(
                            "Recovery strategy '{}' returned action: {:?}",
                            strategy.name, action
                        );
                        return Ok(action);
                    }
                    Err(e) => {
                        warn!("Recovery strategy '{}' failed: {}", strategy.name, e);
                        continue;
                    }
                }
            }
        }

        warn!("No recovery strategy found for error: {}", error);
        Ok(RecoveryAction::Abort)
    }

    pub async fn recover_with_retry<F, Fut, T>(
        &self,
        error: &AGIError,
        operation: F,
        max_recovery_attempts: u32,
    ) -> Result<T>
    where
        F: Fn() -> Fut,
        Fut: Future<Output = Result<T>>,
    {
        let mut attempts = 0;

        while attempts < max_recovery_attempts {
            attempts += 1;

            match self.recover(error).await? {
                RecoveryAction::Retry => {
                    info!("Retrying operation (attempt {})", attempts);
                    match operation().await {
                        Ok(result) => return Ok(result),
                        Err(e) => {
                            warn!("Retry failed: {}", e);
                            if attempts >= max_recovery_attempts {
                                return Err(e);
                            }
                            continue;
                        }
                    }
                }
                RecoveryAction::WaitAndRetry(ms) => {
                    info!("Waiting {}ms before retry", ms);
                    tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
                    match operation().await {
                        Ok(result) => return Ok(result),
                        Err(e) => {
                            warn!("Retry after wait failed: {}", e);
                            if attempts >= max_recovery_attempts {
                                return Err(e);
                            }
                            continue;
                        }
                    }
                }
                RecoveryAction::Fallback(msg) => {
                    info!("Using fallback strategy: {}", msg);

                    return Err(AGIError::TransientError(format!(
                        "Fallback required: {}",
                        msg
                    )));
                }
                RecoveryAction::Skip => {
                    info!("Skipping failed operation");
                    return Err(AGIError::TransientError("Operation skipped".to_string()));
                }
                RecoveryAction::Abort => {
                    warn!("Recovery aborted");
                    return Err(error.clone());
                }
                RecoveryAction::RequestUserInput(msg) => {
                    warn!("User input required: {}", msg);
                    return Err(AGIError::PermissionError(msg));
                }
            }
        }

        Err(AGIError::FatalError(format!(
            "Recovery exhausted after {} attempts",
            max_recovery_attempts
        )))
    }
}

impl Default for RecoveryManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_recovery_manager_browser_element_not_found() {
        let manager = RecoveryManager::new();
        let error = AGIError::ToolError(ToolError::BrowserError("element not found".to_string()));

        let action = manager.recover(&error).await.unwrap();
        assert!(matches!(action, RecoveryAction::Fallback(_)));
    }

    #[tokio::test]
    async fn test_recovery_manager_llm_rate_limit() {
        let manager = RecoveryManager::new();
        let error = AGIError::LLMError(LLMError::RateLimitError("Rate limit exceeded".to_string()));

        let action = manager.recover(&error).await.unwrap();
        assert!(matches!(action, RecoveryAction::Fallback(_)));
    }

    #[tokio::test]
    async fn test_recovery_manager_permission_denied() {
        let manager = RecoveryManager::new();
        let error = AGIError::PermissionError("Access denied".to_string());

        let action = manager.recover(&error).await.unwrap();
        assert!(matches!(action, RecoveryAction::RequestUserInput(_)));
    }

    #[tokio::test]
    async fn test_recovery_manager_no_matching_strategy() {
        let manager = RecoveryManager::new();
        let error = AGIError::FatalError("Unknown error".to_string());

        let action = manager.recover(&error).await.unwrap();
        assert!(matches!(action, RecoveryAction::Abort));
    }
}
