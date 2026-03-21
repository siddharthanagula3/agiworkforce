//! Background LLM request manager
//!
//! Manages a queue of background LLM requests that can be submitted,
//! polled, cancelled, and cleaned up asynchronously.
//!
//! A `tokio::spawn` loop is started when `BackgroundManager::new_with_router`
//! is called, so queued requests are automatically driven to completion
//! without requiring the caller to periodically invoke `process_queue`.

use crate::core::llm::{LLMRequest, Provider};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Notify, RwLock};

/// Status of a background LLM request
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackgroundStatus {
    Queued,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

/// A background LLM request record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundRequest {
    pub id: String,
    pub status: BackgroundStatus,
    pub model: String,
    pub provider: String,
    pub result: Option<String>,
    pub error: Option<String>,
    #[serde(skip)]
    pub created_at: Option<Instant>,
}

/// The pending data needed to execute a queued request.
/// Stored separately from `BackgroundRequest` so we don't need to clone LLMRequest.
struct PendingEntry {
    request: LLMRequest,
    provider: Provider,
}

/// Result of submitting a background request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundSubmitResult {
    pub response_id: String,
    pub status: BackgroundStatus,
}

/// Statistics about the background LLM queue
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundStatistics {
    pub total: usize,
    pub queued: usize,
    pub processing: usize,
    pub completed: usize,
    pub failed: usize,
    pub cancelled: usize,
}

/// Manages background LLM requests.
///
/// When an `LLMRouter` is provided via `new_with_router`, an event-driven
/// processing loop is spawned that wakes immediately on `Notify` when a new
/// request is submitted, with a 5-second ceiling as a safety net for missed
/// notifications.  Requests are processed concurrently up to `max_concurrent`
/// at a time.  Without a router, `submit_request` still enqueues items but
/// they stay `Queued` (useful for unit tests that inspect queue state).
pub struct BackgroundManager {
    requests: Arc<RwLock<HashMap<String, BackgroundRequest>>>,
    pending: Arc<RwLock<HashMap<String, PendingEntry>>>,
    max_concurrent: usize,
    /// Notifies the processing loop that a new request has been queued,
    /// replacing the previous 500ms polling interval.
    notify: Arc<Notify>,
}

impl BackgroundManager {
    /// Create a manager without an attached router.
    /// Requests will queue but not be automatically processed.
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            requests: Arc::new(RwLock::new(HashMap::new())),
            pending: Arc::new(RwLock::new(HashMap::new())),
            max_concurrent,
            notify: Arc::new(Notify::new()),
        }
    }

    /// Create a manager and spawn a background processing loop driven by `router`.
    pub fn new_with_router(
        max_concurrent: usize,
        router: Arc<crate::core::llm::llm_router::LLMRouter>,
    ) -> Self {
        let manager = Self::new(max_concurrent);
        manager.spawn_processing_loop(router);
        manager
    }

    /// Spawn the tokio task that continuously drains the queue.
    fn spawn_processing_loop(&self, router: Arc<crate::core::llm::llm_router::LLMRouter>) {
        let requests = self.requests.clone();
        let pending = self.pending.clone();
        let max_concurrent = self.max_concurrent;
        let notify = self.notify.clone();

        tokio::spawn(async move {
            loop {
                // Wait until notified that a new request was queued, with a
                // 5-second ceiling to handle edge cases (e.g. if a notify was
                // missed due to a race).
                tokio::select! {
                    _ = notify.notified() => {}
                    _ = tokio::time::sleep(Duration::from_secs(5)) => {}
                }

                // Collect IDs that are Queued and not yet being processed.
                let queued_ids: Vec<String> = {
                    let reqs = requests.read().await;
                    let processing_count = reqs
                        .values()
                        .filter(|r| matches!(r.status, BackgroundStatus::Processing))
                        .count();
                    let slots = max_concurrent.saturating_sub(processing_count);
                    reqs.values()
                        .filter(|r| matches!(r.status, BackgroundStatus::Queued))
                        .take(slots)
                        .map(|r| r.id.clone())
                        .collect()
                };

                for id in queued_ids {
                    // Mark as Processing and remove from pending map.
                    let entry = {
                        let mut pend = pending.write().await;
                        pend.remove(&id)
                    };

                    if let Some(entry) = entry {
                        {
                            let mut reqs = requests.write().await;
                            if let Some(req) = reqs.get_mut(&id) {
                                req.status = BackgroundStatus::Processing;
                            }
                        }

                        // Clone Arcs for the spawned task.
                        let requests_clone = requests.clone();
                        let router_clone = router.clone();
                        let id_clone = id.clone();

                        tokio::spawn(async move {
                            let prefs = crate::core::llm::llm_router::RouterPreferences {
                                provider: Some(entry.provider),
                                model: Some(entry.request.model.clone()),
                                ..Default::default()
                            };

                            let result = router_clone
                                .route_with_retry(&entry.request, &prefs, None)
                                .await;

                            let mut reqs = requests_clone.write().await;
                            if let Some(req) = reqs.get_mut(&id_clone) {
                                match result {
                                    Ok(outcome) => {
                                        req.status = BackgroundStatus::Completed;
                                        req.result = Some(outcome.response.content);
                                    }
                                    Err(e) => {
                                        req.status = BackgroundStatus::Failed;
                                        req.error = Some(e.to_string());
                                    }
                                }
                            }
                        });
                    } else {
                        // Pending entry was removed (e.g. cancelled). Fail gracefully.
                        let mut reqs = requests.write().await;
                        if let Some(req) = reqs.get_mut(&id) {
                            if matches!(req.status, BackgroundStatus::Queued) {
                                req.status = BackgroundStatus::Failed;
                                req.error = Some("Pending data missing".to_string());
                            }
                        }
                    }
                }
            }
        });
    }

    pub async fn submit_request(
        &self,
        request: LLMRequest,
        provider: Provider,
        _webhook_url: Option<String>,
        _webhook_secret: Option<String>,
    ) -> Result<BackgroundSubmitResult, crate::sys::error::Error> {
        let id = format!(
            "bg_{}",
            &uuid::Uuid::new_v4().to_string().replace("-", "")[..12]
        );
        let bg_request = BackgroundRequest {
            id: id.clone(),
            status: BackgroundStatus::Queued,
            model: request.model.clone(),
            provider: format!("{:?}", provider),
            result: None,
            error: None,
            created_at: Some(Instant::now()),
        };

        // Store the pending execution data so the processing loop can pick it up.
        {
            let mut pend = self.pending.write().await;
            pend.insert(id.clone(), PendingEntry { request, provider });
        }

        let mut requests = self.requests.write().await;
        requests.insert(id.clone(), bg_request);
        drop(requests);

        // Wake the processing loop immediately instead of waiting for the next poll.
        self.notify.notify_one();

        Ok(BackgroundSubmitResult {
            response_id: id,
            status: BackgroundStatus::Queued,
        })
    }

    pub async fn get_status(
        &self,
        response_id: &str,
    ) -> Result<BackgroundRequest, crate::sys::error::Error> {
        let requests = self.requests.read().await;
        requests.get(response_id).cloned().ok_or_else(|| {
            crate::sys::error::Error::Generic(format!(
                "Background request not found: {}",
                response_id
            ))
        })
    }

    pub async fn cancel_request(&self, response_id: &str) -> Result<(), crate::sys::error::Error> {
        // Remove pending data so the processing loop won't dispatch it.
        {
            let mut pend = self.pending.write().await;
            pend.remove(response_id);
        }
        let mut requests = self.requests.write().await;
        if let Some(req) = requests.get_mut(response_id) {
            // Only cancel if not yet completed/failed.
            if matches!(
                req.status,
                BackgroundStatus::Queued | BackgroundStatus::Processing
            ) {
                req.status = BackgroundStatus::Cancelled;
            }
            Ok(())
        } else {
            Err(crate::sys::error::Error::Generic(format!(
                "Background request not found: {}",
                response_id
            )))
        }
    }

    pub async fn get_statistics(&self) -> BackgroundStatistics {
        let requests = self.requests.read().await;
        let mut stats = BackgroundStatistics {
            total: requests.len(),
            queued: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
        };
        for req in requests.values() {
            match req.status {
                BackgroundStatus::Queued => stats.queued += 1,
                BackgroundStatus::Processing => stats.processing += 1,
                BackgroundStatus::Completed => stats.completed += 1,
                BackgroundStatus::Failed => stats.failed += 1,
                BackgroundStatus::Cancelled => stats.cancelled += 1,
            }
        }
        stats
    }

    /// Returns the IDs of requests that are currently Queued.
    /// When `new_with_router` was used the loop drives processing automatically;
    /// this method is retained for observability and manual invocation in tests.
    pub async fn process_queue(&self) -> Result<Vec<String>, crate::sys::error::Error> {
        let requests = self.requests.read().await;
        let queued: Vec<String> = requests
            .values()
            .filter(|r| matches!(r.status, BackgroundStatus::Queued))
            .take(self.max_concurrent)
            .map(|r| r.id.clone())
            .collect();
        Ok(queued)
    }

    pub async fn cleanup_completed(
        &self,
        max_age: Duration,
    ) -> Result<usize, crate::sys::error::Error> {
        let mut requests = self.requests.write().await;
        let now = Instant::now();
        let before = requests.len();
        requests.retain(|_, req| {
            if matches!(
                req.status,
                BackgroundStatus::Completed
                    | BackgroundStatus::Failed
                    | BackgroundStatus::Cancelled
            ) {
                if let Some(created) = req.created_at {
                    return now.duration_since(created) < max_age;
                }
            }
            true
        });

        // Also clean up orphaned pending entries.
        let mut pend = self.pending.write().await;
        let remaining_ids: std::collections::HashSet<&String> = requests.keys().collect();
        pend.retain(|id, _| remaining_ids.contains(id));

        Ok(before - requests.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::llm::{ChatMessage, LLMRequest, Provider};

    /// Helper: create a minimal LLMRequest for testing.
    fn test_request(model: &str) -> LLMRequest {
        LLMRequest::new(
            vec![ChatMessage {
                role: "user".to_string(),
                content: "hello".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model.to_string(),
        )
    }

    // ------------------------------------------------------------------
    // Construction
    // ------------------------------------------------------------------

    #[test]
    fn test_new_creates_empty_manager() {
        let manager = BackgroundManager::new(4);
        assert_eq!(manager.max_concurrent, 4);
    }

    // ------------------------------------------------------------------
    // Submit request enqueues and returns Queued status
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_submit_request_returns_queued() {
        let manager = BackgroundManager::new(2);
        let request = test_request("gpt-5.4");

        let result = manager
            .submit_request(request, Provider::OpenAI, None, None)
            .await
            .expect("submit should succeed");

        assert!(result.response_id.starts_with("bg_"));
        assert!(matches!(result.status, BackgroundStatus::Queued));
    }

    // ------------------------------------------------------------------
    // get_status returns the request after submission
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_get_status_after_submit() {
        let manager = BackgroundManager::new(2);
        let request = test_request("claude-sonnet-4-20250514");

        let submit_result = manager
            .submit_request(request, Provider::Anthropic, None, None)
            .await
            .unwrap();

        let status = manager
            .get_status(&submit_result.response_id)
            .await
            .unwrap();
        assert_eq!(status.id, submit_result.response_id);
        assert_eq!(status.model, "claude-sonnet-4-20250514");
        assert!(matches!(status.status, BackgroundStatus::Queued));
    }

    // ------------------------------------------------------------------
    // get_status for unknown ID returns error
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_get_status_unknown_returns_error() {
        let manager = BackgroundManager::new(2);
        let result = manager.get_status("nonexistent").await;
        assert!(result.is_err());
    }

    // ------------------------------------------------------------------
    // Cancel a queued request
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_cancel_queued_request() {
        let manager = BackgroundManager::new(2);
        let request = test_request("gpt-5.4");

        let submit_result = manager
            .submit_request(request, Provider::OpenAI, None, None)
            .await
            .unwrap();

        manager
            .cancel_request(&submit_result.response_id)
            .await
            .unwrap();

        let status = manager
            .get_status(&submit_result.response_id)
            .await
            .unwrap();
        assert!(matches!(status.status, BackgroundStatus::Cancelled));
    }

    // ------------------------------------------------------------------
    // Cancel removes pending data so the loop will not dispatch it
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_cancel_removes_pending_data() {
        let manager = BackgroundManager::new(2);
        let request = test_request("gpt-5.4");

        let submit_result = manager
            .submit_request(request, Provider::OpenAI, None, None)
            .await
            .unwrap();

        // Pending should exist before cancel
        {
            let pend = manager.pending.read().await;
            assert!(pend.contains_key(&submit_result.response_id));
        }

        manager
            .cancel_request(&submit_result.response_id)
            .await
            .unwrap();

        // Pending should be removed after cancel
        {
            let pend = manager.pending.read().await;
            assert!(!pend.contains_key(&submit_result.response_id));
        }
    }

    // ------------------------------------------------------------------
    // Cancel unknown ID returns error
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_cancel_unknown_returns_error() {
        let manager = BackgroundManager::new(2);
        let result = manager.cancel_request("nonexistent").await;
        assert!(result.is_err());
    }

    // ------------------------------------------------------------------
    // Statistics are accurate
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_statistics_empty() {
        let manager = BackgroundManager::new(2);
        let stats = manager.get_statistics().await;
        assert_eq!(stats.total, 0);
        assert_eq!(stats.queued, 0);
    }

    #[tokio::test]
    async fn test_statistics_after_submit_and_cancel() {
        let manager = BackgroundManager::new(4);

        // Submit 3 requests
        for _ in 0..3 {
            let request = test_request("gpt-5.4");
            manager
                .submit_request(request, Provider::OpenAI, None, None)
                .await
                .unwrap();
        }

        let stats = manager.get_statistics().await;
        assert_eq!(stats.total, 3);
        assert_eq!(stats.queued, 3);

        // Cancel one by getting its ID first
        let id = {
            let reqs = manager.requests.read().await;
            reqs.keys()
                .next()
                .cloned()
                .expect("should have at least one")
        };

        manager.cancel_request(&id).await.unwrap();

        let stats = manager.get_statistics().await;
        assert_eq!(stats.total, 3);
        assert_eq!(stats.queued, 2);
        assert_eq!(stats.cancelled, 1);
    }

    // ------------------------------------------------------------------
    // process_queue returns queued IDs up to max_concurrent
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_process_queue_returns_queued_ids() {
        let manager = BackgroundManager::new(2);

        // Submit 4 requests
        for _ in 0..4 {
            let request = test_request("gpt-5.4");
            manager
                .submit_request(request, Provider::OpenAI, None, None)
                .await
                .unwrap();
        }

        let queued = manager.process_queue().await.unwrap();
        // max_concurrent is 2, so at most 2 returned
        assert_eq!(queued.len(), 2);
    }

    // ------------------------------------------------------------------
    // Cleanup removes old terminal requests
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_cleanup_removes_old_completed() {
        let manager = BackgroundManager::new(2);

        let request = test_request("gpt-5.4");
        let submit_result = manager
            .submit_request(request, Provider::OpenAI, None, None)
            .await
            .unwrap();

        // Manually mark as completed with a very old created_at
        {
            let mut reqs = manager.requests.write().await;
            if let Some(req) = reqs.get_mut(&submit_result.response_id) {
                req.status = BackgroundStatus::Completed;
                // Set created_at far in the past (instant arithmetic: it was created 10s ago)
                req.created_at = Some(Instant::now() - Duration::from_secs(10));
            }
        }

        // Cleanup with max_age of 1 second -> should remove it
        let removed = manager
            .cleanup_completed(Duration::from_secs(1))
            .await
            .unwrap();
        assert_eq!(removed, 1);

        let stats = manager.get_statistics().await;
        assert_eq!(stats.total, 0);
    }

    #[tokio::test]
    async fn test_cleanup_keeps_recent_completed() {
        let manager = BackgroundManager::new(2);

        let request = test_request("gpt-5.4");
        let submit_result = manager
            .submit_request(request, Provider::OpenAI, None, None)
            .await
            .unwrap();

        // Mark as completed (created_at is recent)
        {
            let mut reqs = manager.requests.write().await;
            if let Some(req) = reqs.get_mut(&submit_result.response_id) {
                req.status = BackgroundStatus::Completed;
            }
        }

        // Cleanup with max_age of 1 hour -> should keep it
        let removed = manager
            .cleanup_completed(Duration::from_secs(3600))
            .await
            .unwrap();
        assert_eq!(removed, 0);

        let stats = manager.get_statistics().await;
        assert_eq!(stats.total, 1);
        assert_eq!(stats.completed, 1);
    }

    #[tokio::test]
    async fn test_cleanup_keeps_queued_requests() {
        let manager = BackgroundManager::new(2);

        let request = test_request("gpt-5.4");
        manager
            .submit_request(request, Provider::OpenAI, None, None)
            .await
            .unwrap();

        // Cleanup with zero max_age -> should keep queued requests
        let removed = manager
            .cleanup_completed(Duration::from_secs(0))
            .await
            .unwrap();
        assert_eq!(removed, 0);
    }

    // ------------------------------------------------------------------
    // Cleanup also removes orphaned pending entries
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_cleanup_removes_orphaned_pending() {
        let manager = BackgroundManager::new(2);

        let request = test_request("gpt-5.4");
        let submit_result = manager
            .submit_request(request, Provider::OpenAI, None, None)
            .await
            .unwrap();

        // Mark as failed with old timestamp
        {
            let mut reqs = manager.requests.write().await;
            if let Some(req) = reqs.get_mut(&submit_result.response_id) {
                req.status = BackgroundStatus::Failed;
                req.created_at = Some(Instant::now() - Duration::from_secs(10));
            }
        }

        // Pending entry should still exist
        {
            let pend = manager.pending.read().await;
            assert!(pend.contains_key(&submit_result.response_id));
        }

        // Cleanup removes both the request and the orphaned pending entry
        let removed = manager
            .cleanup_completed(Duration::from_secs(1))
            .await
            .unwrap();
        assert_eq!(removed, 1);

        let pend = manager.pending.read().await;
        assert!(pend.is_empty(), "pending should be cleaned up too");
    }

    // ------------------------------------------------------------------
    // Notify wakes the processing loop (non-router mode: verify notify exists)
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_submit_triggers_notify() {
        let manager = BackgroundManager::new(2);

        // Clone the notify handle to observe it
        let notify = manager.notify.clone();

        // Submit triggers notify_one() internally
        let request = test_request("gpt-5.4");
        manager
            .submit_request(request, Provider::OpenAI, None, None)
            .await
            .unwrap();

        // The notified future should resolve immediately because submit called notify_one().
        // We race against a short timeout to confirm the notification was sent.
        let was_notified = tokio::select! {
            _ = notify.notified() => true,
            _ = tokio::time::sleep(Duration::from_millis(50)) => false,
        };

        assert!(was_notified, "submit_request should wake the notify");
    }

    // ------------------------------------------------------------------
    // Multiple submits produce unique IDs
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_submit_generates_unique_ids() {
        let manager = BackgroundManager::new(4);

        let mut ids = Vec::new();
        for _ in 0..10 {
            let request = test_request("gpt-5.4");
            let result = manager
                .submit_request(request, Provider::OpenAI, None, None)
                .await
                .unwrap();
            ids.push(result.response_id);
        }

        // All IDs must be unique
        let unique: std::collections::HashSet<&String> = ids.iter().collect();
        assert_eq!(unique.len(), ids.len(), "all IDs should be unique");
    }

    // ------------------------------------------------------------------
    // Cancel idempotence: cancelling an already-cancelled request is OK
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_cancel_idempotent_on_cancelled() {
        let manager = BackgroundManager::new(2);
        let request = test_request("gpt-5.4");

        let submit_result = manager
            .submit_request(request, Provider::OpenAI, None, None)
            .await
            .unwrap();

        manager
            .cancel_request(&submit_result.response_id)
            .await
            .unwrap();

        // Cancel again -- should succeed without error
        manager
            .cancel_request(&submit_result.response_id)
            .await
            .unwrap();

        let status = manager
            .get_status(&submit_result.response_id)
            .await
            .unwrap();
        assert!(matches!(status.status, BackgroundStatus::Cancelled));
    }

    // ------------------------------------------------------------------
    // Provider is formatted in the request record
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_provider_stored_as_debug_string() {
        let manager = BackgroundManager::new(2);
        let request = test_request("gemini-2.5-pro");

        let submit_result = manager
            .submit_request(request, Provider::Google, None, None)
            .await
            .unwrap();

        let status = manager
            .get_status(&submit_result.response_id)
            .await
            .unwrap();
        assert_eq!(status.provider, "Google");
    }

    // ------------------------------------------------------------------
    // BackgroundStatus serialization (serde)
    // ------------------------------------------------------------------

    #[test]
    fn test_background_status_serialization() {
        let json = serde_json::to_string(&BackgroundStatus::Queued).unwrap();
        assert_eq!(json, "\"queued\"");

        let json = serde_json::to_string(&BackgroundStatus::Processing).unwrap();
        assert_eq!(json, "\"processing\"");

        let json = serde_json::to_string(&BackgroundStatus::Completed).unwrap();
        assert_eq!(json, "\"completed\"");

        let json = serde_json::to_string(&BackgroundStatus::Failed).unwrap();
        assert_eq!(json, "\"failed\"");

        let json = serde_json::to_string(&BackgroundStatus::Cancelled).unwrap();
        assert_eq!(json, "\"cancelled\"");
    }

    #[test]
    fn test_background_status_deserialization() {
        let status: BackgroundStatus = serde_json::from_str("\"queued\"").unwrap();
        assert!(matches!(status, BackgroundStatus::Queued));

        let status: BackgroundStatus = serde_json::from_str("\"completed\"").unwrap();
        assert!(matches!(status, BackgroundStatus::Completed));
    }

    // ------------------------------------------------------------------
    // BackgroundStatistics serialization
    // ------------------------------------------------------------------

    #[test]
    fn test_background_statistics_serialization() {
        let stats = BackgroundStatistics {
            total: 10,
            queued: 2,
            processing: 3,
            completed: 4,
            failed: 1,
            cancelled: 0,
        };
        let json = serde_json::to_string(&stats).unwrap();
        assert!(json.contains("\"total\":10"));
        assert!(json.contains("\"queued\":2"));
    }

    // ------------------------------------------------------------------
    // BackgroundSubmitResult serialization
    // ------------------------------------------------------------------

    #[test]
    fn test_submit_result_serialization() {
        let result = BackgroundSubmitResult {
            response_id: "bg_abc123".to_string(),
            status: BackgroundStatus::Queued,
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"response_id\":\"bg_abc123\""));
        assert!(json.contains("\"status\":\"queued\""));
    }
}
