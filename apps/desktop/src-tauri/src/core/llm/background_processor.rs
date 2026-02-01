//! Background LLM request processor
//!
//! Handles the execution of background LLM requests using the provider system.

use super::background_manager::{BackgroundManager, BackgroundStatus};
use super::LLMProvider;
use crate::sys::error::{Error, Result};
use std::sync::Arc;
use tokio::time::{interval, Duration};

/// Background LLM processor
pub struct BackgroundProcessor<P: LLMProvider + Send + Sync + 'static> {
    manager: Arc<BackgroundManager>,
    provider: Arc<P>,
}

impl<P: LLMProvider + Send + Sync + 'static> BackgroundProcessor<P> {
    /// Create a new background processor
    pub fn new(manager: Arc<BackgroundManager>, provider: Arc<P>) -> Self {
        Self { manager, provider }
    }

    /// Start processing background requests
    pub async fn start(self: Arc<Self>) {
        // Process queue every 5 seconds
        let processor = self.clone();
        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(5));
            loop {
                ticker.tick().await;
                if let Err(e) = processor.process_pending_requests().await {
                    tracing::error!("Error processing background requests: {}", e);
                }
            }
        });

        // Cleanup completed requests every hour
        let processor_cleanup = self.clone();
        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(3600));
            loop {
                ticker.tick().await;
                if let Err(e) = processor_cleanup
                    .manager
                    .cleanup_completed(Duration::from_secs(24 * 3600))
                    .await
                {
                    tracing::error!("Error cleaning up background requests: {}", e);
                }
            }
        });
    }

    /// Process pending background requests
    async fn process_pending_requests(&self) -> Result<()> {
        // Check for requests that can be started
        let started = self.manager.process_queue().await?;

        for response_id in started {
            let processor = Arc::new(self.clone());
            tokio::spawn(async move {
                if let Err(e) = processor.execute_request(&response_id).await {
                    tracing::error!("Error executing background request {}: {}", response_id, e);
                    let _ = processor
                        .manager
                        .fail_request(&response_id, e.to_string())
                        .await;
                }
            });
        }

        Ok(())
    }

    /// Execute a single background request
    async fn execute_request(&self, response_id: &str) -> Result<()> {
        // Get the request details
        let request_info = self.manager.get_status(response_id).await?;

        if request_info.status != BackgroundStatus::InProgress {
            return Ok(()); // Already completed or cancelled
        }

        // Update progress
        self.manager
            .update_progress(response_id, 10, "Starting request".to_string(), None)
            .await?;

        // Execute the request
        let response = self
            .provider
            .send_message(&request_info.request)
            .await
            .map_err(|e| Error::Generic(format!("Provider error: {}", e)))?;

        // Update progress
        self.manager
            .update_progress(
                response_id,
                90,
                "Request completed".to_string(),
                response.tokens,
            )
            .await?;

        // Mark as completed
        self.manager.complete_request(response_id, response).await?;

        tracing::info!("Background request {} completed successfully", response_id);
        Ok(())
    }
}

impl<P: LLMProvider + Send + Sync + 'static> Clone for BackgroundProcessor<P> {
    fn clone(&self) -> Self {
        Self {
            manager: self.manager.clone(),
            provider: self.provider.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    // Tests will be added when provider instances are available
}
