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
/// When an `LLMRouter` is provided via `new_with_router`, a `tokio::spawn`
/// loop continuously polls the queue and processes requests concurrently up
/// to `max_concurrent` at a time.  Without a router, `submit_request` still
/// enqueues items but they stay `Queued` until a caller invokes
/// `process_queue` manually (used in tests).
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
