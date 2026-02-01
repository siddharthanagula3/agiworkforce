//! Background mode manager for LLM requests
//!
//! Implements OpenAI-style background request handling with status polling and webhook notifications.
//! Background requests are processed asynchronously with status tracking and completion notifications.

use super::{LLMRequest, LLMResponse, Provider};
use crate::sys::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Background request state
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BackgroundStatus {
    /// Request is queued and waiting to be processed
    Queued,
    /// Request is currently being processed
    InProgress,
    /// Request completed successfully
    Completed,
    /// Request failed with error
    Failed,
    /// Request was cancelled
    Cancelled,
}

/// Background request metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundRequest {
    /// Unique response ID for polling
    pub response_id: String,
    /// Current status
    pub status: BackgroundStatus,
    /// Original LLM request
    pub request: LLMRequest,
    /// Provider to use for this request
    pub provider: Provider,
    /// Webhook URL to notify on completion (optional)
    pub webhook_url: Option<String>,
    /// Webhook secret for signature verification (optional)
    pub webhook_secret: Option<String>,
    /// Completion response (if completed)
    pub response: Option<LLMResponse>,
    /// Error message (if failed)
    pub error: Option<String>,
    /// Progress information
    pub progress: Option<ProgressInfo>,
    /// Estimated completion time (Unix timestamp)
    pub estimated_completion_at: Option<i64>,
    /// Queue position (if queued)
    pub queue_position: Option<u32>,
    /// When the request was created (Unix timestamp)
    pub created_at: i64,
    /// When the request started processing (Unix timestamp)
    pub started_at: Option<i64>,
    /// When the request completed/failed (Unix timestamp)
    pub completed_at: Option<i64>,
    /// Request metadata
    pub metadata: Option<serde_json::Value>,
}

/// Progress information for in-progress requests
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressInfo {
    /// Progress percentage (0-100)
    pub percentage: u8,
    /// Current step description
    pub step: String,
    /// Total number of tokens generated so far
    pub tokens_generated: Option<u32>,
    /// Last update timestamp
    pub updated_at: i64,
}

/// Webhook event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookEvent {
    /// Event type (background.completed, background.failed)
    pub event: String,
    /// Response ID
    pub response_id: String,
    /// Current status
    pub status: BackgroundStatus,
    /// Completion response (if completed)
    pub response: Option<LLMResponse>,
    /// Error message (if failed)
    pub error: Option<String>,
    /// Event timestamp
    pub timestamp: i64,
    /// Custom metadata from the original request
    pub metadata: Option<serde_json::Value>,
}

/// Background request submission result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundSubmitResult {
    /// Response ID for polling
    pub response_id: String,
    /// Initial status
    pub status: BackgroundStatus,
    /// Queue position (if queued)
    pub queue_position: Option<u32>,
    /// Estimated completion time (Unix timestamp)
    pub estimated_completion_at: Option<i64>,
}

/// Background mode manager
pub struct BackgroundManager {
    /// Active background requests
    requests: Arc<RwLock<HashMap<String, BackgroundRequest>>>,
    /// HTTP client for webhook notifications
    webhook_client: reqwest::Client,
    /// Maximum concurrent background requests
    max_concurrent: usize,
    /// Current number of in-progress requests
    in_progress_count: Arc<RwLock<usize>>,
}

impl BackgroundManager {
    /// Create a new background manager
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            requests: Arc::new(RwLock::new(HashMap::new())),
            webhook_client: reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
            max_concurrent,
            in_progress_count: Arc::new(RwLock::new(0)),
        }
    }

    /// Submit a background request
    pub async fn submit_request(
        &self,
        request: LLMRequest,
        provider: Provider,
        webhook_url: Option<String>,
        webhook_secret: Option<String>,
    ) -> Result<BackgroundSubmitResult> {
        let response_id = format!("bg_{}", Uuid::new_v4());
        let now = chrono::Utc::now().timestamp();

        // Calculate queue position and estimated completion
        let mut requests = self.requests.write().await;
        let in_progress = *self.in_progress_count.read().await;

        let queued_count = requests
            .values()
            .filter(|r| r.status == BackgroundStatus::Queued)
            .count();

        let (status, queue_position, estimated_completion_at) = if in_progress < self.max_concurrent
        {
            (BackgroundStatus::InProgress, None, Some(now + 60)) // ~1 min estimate
        } else {
            let position = (queued_count + 1) as u32;
            let estimated_wait = 60 * position as i64; // ~1 min per queued request
            (
                BackgroundStatus::Queued,
                Some(position),
                Some(now + estimated_wait),
            )
        };

        let background_request = BackgroundRequest {
            response_id: response_id.clone(),
            status,
            request,
            provider,
            webhook_url,
            webhook_secret,
            response: None,
            error: None,
            progress: None,
            estimated_completion_at,
            queue_position,
            created_at: now,
            started_at: if status == BackgroundStatus::InProgress {
                Some(now)
            } else {
                None
            },
            completed_at: None,
            metadata: None,
        };

        requests.insert(response_id.clone(), background_request);

        Ok(BackgroundSubmitResult {
            response_id,
            status,
            queue_position,
            estimated_completion_at,
        })
    }

    /// Get the status of a background request
    pub async fn get_status(&self, response_id: &str) -> Result<BackgroundRequest> {
        let requests = self.requests.read().await;
        requests
            .get(response_id)
            .cloned()
            .ok_or_else(|| Error::Generic(format!("Background request {} not found", response_id)))
    }

    /// Cancel a background request
    pub async fn cancel_request(&self, response_id: &str) -> Result<()> {
        let mut requests = self.requests.write().await;

        if let Some(request) = requests.get_mut(response_id) {
            match request.status {
                BackgroundStatus::Queued | BackgroundStatus::InProgress => {
                    request.status = BackgroundStatus::Cancelled;
                    request.completed_at = Some(chrono::Utc::now().timestamp());
                    Ok(())
                }
                _ => Err(Error::Generic(format!(
                    "Cannot cancel request in status {:?}",
                    request.status
                ))),
            }
        } else {
            Err(Error::Generic(format!(
                "Background request {} not found",
                response_id
            )))
        }
    }

    /// Update progress for a background request
    pub async fn update_progress(
        &self,
        response_id: &str,
        percentage: u8,
        step: String,
        tokens_generated: Option<u32>,
    ) -> Result<()> {
        let mut requests = self.requests.write().await;

        if let Some(request) = requests.get_mut(response_id) {
            let now = chrono::Utc::now().timestamp();
            request.progress = Some(ProgressInfo {
                percentage: percentage.min(100),
                step,
                tokens_generated,
                updated_at: now,
            });
            Ok(())
        } else {
            Err(Error::Generic(format!(
                "Background request {} not found",
                response_id
            )))
        }
    }

    /// Mark a background request as completed
    pub async fn complete_request(&self, response_id: &str, response: LLMResponse) -> Result<()> {
        let mut requests = self.requests.write().await;

        if let Some(request) = requests.get_mut(response_id) {
            let now = chrono::Utc::now().timestamp();
            request.status = BackgroundStatus::Completed;
            request.response = Some(response.clone());
            request.completed_at = Some(now);

            // Update progress to 100%
            request.progress = Some(ProgressInfo {
                percentage: 100,
                step: "Completed".to_string(),
                tokens_generated: response.tokens,
                updated_at: now,
            });

            // Decrement in-progress count
            let mut in_progress = self.in_progress_count.write().await;
            *in_progress = in_progress.saturating_sub(1);

            // Send webhook notification if configured
            if let Some(webhook_url) = &request.webhook_url {
                let webhook_secret = request.webhook_secret.clone();
                let webhook_url = webhook_url.clone();
                let metadata = request.metadata.clone();
                let response_id = response_id.to_string();

                // Send webhook asynchronously (don't wait for completion)
                let client = self.webhook_client.clone();
                tokio::spawn(async move {
                    let _ = Self::send_webhook_notification(
                        &client,
                        &webhook_url,
                        webhook_secret.as_deref(),
                        WebhookEvent {
                            event: "background.completed".to_string(),
                            response_id: response_id.clone(),
                            status: BackgroundStatus::Completed,
                            response: Some(response),
                            error: None,
                            timestamp: now,
                            metadata,
                        },
                    )
                    .await;
                });
            }

            Ok(())
        } else {
            Err(Error::Generic(format!(
                "Background request {} not found",
                response_id
            )))
        }
    }

    /// Mark a background request as failed
    pub async fn fail_request(&self, response_id: &str, error: String) -> Result<()> {
        let mut requests = self.requests.write().await;

        if let Some(request) = requests.get_mut(response_id) {
            let now = chrono::Utc::now().timestamp();
            request.status = BackgroundStatus::Failed;
            request.error = Some(error.clone());
            request.completed_at = Some(now);

            // Decrement in-progress count
            let mut in_progress = self.in_progress_count.write().await;
            *in_progress = in_progress.saturating_sub(1);

            // Send webhook notification if configured
            if let Some(webhook_url) = &request.webhook_url {
                let webhook_secret = request.webhook_secret.clone();
                let webhook_url = webhook_url.clone();
                let metadata = request.metadata.clone();
                let response_id = response_id.to_string();

                // Send webhook asynchronously (don't wait for completion)
                let client = self.webhook_client.clone();
                tokio::spawn(async move {
                    let _ = Self::send_webhook_notification(
                        &client,
                        &webhook_url,
                        webhook_secret.as_deref(),
                        WebhookEvent {
                            event: "background.failed".to_string(),
                            response_id: response_id.clone(),
                            status: BackgroundStatus::Failed,
                            response: None,
                            error: Some(error),
                            timestamp: now,
                            metadata,
                        },
                    )
                    .await;
                });
            }

            Ok(())
        } else {
            Err(Error::Generic(format!(
                "Background request {} not found",
                response_id
            )))
        }
    }

    /// Send webhook notification
    async fn send_webhook_notification(
        client: &reqwest::Client,
        webhook_url: &str,
        webhook_secret: Option<&str>,
        event: WebhookEvent,
    ) -> Result<()> {
        let payload = serde_json::to_string(&event)
            .map_err(|e| Error::Generic(format!("Failed to serialize webhook payload: {}", e)))?;

        let mut request = client
            .post(webhook_url)
            .header("Content-Type", "application/json");

        // Add signature if secret is provided
        if let Some(secret) = webhook_secret {
            use hmac::{Hmac, Mac};
            use sha2::Sha256;

            type HmacSha256 = Hmac<Sha256>;

            let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
                .map_err(|e| Error::Generic(format!("Invalid webhook secret: {}", e)))?;
            mac.update(payload.as_bytes());
            let signature = hex::encode(mac.finalize().into_bytes());

            let timestamp = chrono::Utc::now().timestamp();
            request = request.header(
                "X-Webhook-Signature",
                format!("t={},v1={}", timestamp, signature),
            );
            request = request.header("X-Webhook-Timestamp", timestamp.to_string());
        }

        request
            .body(payload)
            .send()
            .await
            .map_err(|e| Error::Generic(format!("Failed to send webhook: {}", e)))?;

        Ok(())
    }

    /// Process queued requests (should be called periodically)
    pub async fn process_queue(&self) -> Result<Vec<String>> {
        let mut started_requests = Vec::new();
        let mut requests = self.requests.write().await;
        let mut in_progress = self.in_progress_count.write().await;

        // Find queued requests that can be started
        let mut queued: Vec<_> = requests
            .iter_mut()
            .filter(|(_, r)| r.status == BackgroundStatus::Queued)
            .collect();

        // Sort by creation time (FIFO)
        queued.sort_by_key(|(_, r)| r.created_at);

        for (id, request) in queued {
            if *in_progress >= self.max_concurrent {
                break;
            }

            let now = chrono::Utc::now().timestamp();
            request.status = BackgroundStatus::InProgress;
            request.started_at = Some(now);
            request.estimated_completion_at = Some(now + 60); // Update estimate
            request.queue_position = None;

            *in_progress += 1;
            started_requests.push(id.clone());
        }

        // Update queue positions for remaining queued requests
        let mut position = 1;
        for (_, request) in requests.iter_mut() {
            if request.status == BackgroundStatus::Queued {
                request.queue_position = Some(position);
                position += 1;
            }
        }

        Ok(started_requests)
    }

    /// Clean up completed requests older than the specified duration
    pub async fn cleanup_completed(&self, max_age: Duration) -> Result<usize> {
        let mut requests = self.requests.write().await;
        let cutoff = chrono::Utc::now()
            .timestamp()
            .saturating_sub(max_age.as_secs() as i64);

        let to_remove: Vec<_> = requests
            .iter()
            .filter(|(_, r)| {
                matches!(
                    r.status,
                    BackgroundStatus::Completed
                        | BackgroundStatus::Failed
                        | BackgroundStatus::Cancelled
                ) && r.completed_at.map_or(false, |t| t < cutoff)
            })
            .map(|(id, _)| id.clone())
            .collect();

        let count = to_remove.len();
        for id in to_remove {
            requests.remove(&id);
        }

        Ok(count)
    }

    /// Get statistics about background requests
    pub async fn get_statistics(&self) -> BackgroundStatistics {
        let requests = self.requests.read().await;

        let mut stats = BackgroundStatistics {
            total: requests.len(),
            queued: 0,
            in_progress: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
        };

        for request in requests.values() {
            match request.status {
                BackgroundStatus::Queued => stats.queued += 1,
                BackgroundStatus::InProgress => stats.in_progress += 1,
                BackgroundStatus::Completed => stats.completed += 1,
                BackgroundStatus::Failed => stats.failed += 1,
                BackgroundStatus::Cancelled => stats.cancelled += 1,
            }
        }

        stats
    }
}

/// Background request statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundStatistics {
    pub total: usize,
    pub queued: usize,
    pub in_progress: usize,
    pub completed: usize,
    pub failed: usize,
    pub cancelled: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::llm::ChatMessage;

    #[tokio::test]
    async fn test_submit_request() {
        let manager = BackgroundManager::new(2);

        let request = LLMRequest::new(
            vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            "gpt-4".to_string(),
        );

        let result = manager
            .submit_request(request, Provider::OpenAI, None, None)
            .await
            .unwrap();

        assert_eq!(result.status, BackgroundStatus::InProgress);
        assert!(result.response_id.starts_with("bg_"));
    }

    #[tokio::test]
    async fn test_queue_overflow() {
        let manager = BackgroundManager::new(1);

        let request1 = LLMRequest::new(
            vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello 1".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            "gpt-4".to_string(),
        );

        let request2 = LLMRequest::new(
            vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello 2".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            "gpt-4".to_string(),
        );

        let result1 = manager
            .submit_request(request1, Provider::OpenAI, None, None)
            .await
            .unwrap();

        let result2 = manager
            .submit_request(request2, Provider::OpenAI, None, None)
            .await
            .unwrap();

        assert_eq!(result1.status, BackgroundStatus::InProgress);
        assert_eq!(result2.status, BackgroundStatus::Queued);
        assert_eq!(result2.queue_position, Some(1));
    }

    #[tokio::test]
    async fn test_cancel_request() {
        let manager = BackgroundManager::new(2);

        let request = LLMRequest::new(
            vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            "gpt-4".to_string(),
        );

        let result = manager
            .submit_request(request, Provider::OpenAI, None, None)
            .await
            .unwrap();

        manager.cancel_request(&result.response_id).await.unwrap();

        let status = manager.get_status(&result.response_id).await.unwrap();
        assert_eq!(status.status, BackgroundStatus::Cancelled);
    }

    #[tokio::test]
    async fn test_complete_request() {
        let manager = BackgroundManager::new(2);

        let request = LLMRequest::new(
            vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            "gpt-4".to_string(),
        );

        let result = manager
            .submit_request(request, Provider::OpenAI, None, None)
            .await
            .unwrap();

        let response = LLMResponse {
            content: "Hi there!".to_string(),
            tokens: Some(10),
            ..Default::default()
        };

        manager
            .complete_request(&result.response_id, response)
            .await
            .unwrap();

        let status = manager.get_status(&result.response_id).await.unwrap();
        assert_eq!(status.status, BackgroundStatus::Completed);
        assert!(status.response.is_some());
    }

    #[tokio::test]
    async fn test_process_queue() {
        let manager = BackgroundManager::new(1);

        // Submit 3 requests (1 in progress, 2 queued)
        for i in 0..3 {
            let request = LLMRequest::new(
                vec![ChatMessage {
                    role: "user".to_string(),
                    content: format!("Hello {}", i),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                }],
                "gpt-4".to_string(),
            );
            manager
                .submit_request(request, Provider::OpenAI, None, None)
                .await
                .unwrap();
        }

        let stats = manager.get_statistics().await;
        assert_eq!(stats.in_progress, 1);
        assert_eq!(stats.queued, 2);

        // Process queue should not start more (already at max)
        let started = manager.process_queue().await.unwrap();
        assert_eq!(started.len(), 0);
    }
}
