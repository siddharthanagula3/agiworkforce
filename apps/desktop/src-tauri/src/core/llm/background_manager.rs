//! Background LLM request manager
//!
//! Manages a queue of background LLM requests that can be submitted,
//! polled, cancelled, and cleaned up asynchronously.

use crate::core::llm::{LLMRequest, Provider};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

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

/// Manages background LLM requests
pub struct BackgroundManager {
    requests: RwLock<HashMap<String, BackgroundRequest>>,
    max_concurrent: usize,
}

impl BackgroundManager {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            requests: RwLock::new(HashMap::new()),
            max_concurrent,
        }
    }

    pub async fn submit_request(
        &self,
        request: LLMRequest,
        provider: Provider,
        _webhook_url: Option<String>,
        _webhook_secret: Option<String>,
    ) -> Result<BackgroundSubmitResult, crate::sys::error::Error> {
        let id = format!("bg_{}", uuid::Uuid::new_v4().to_string().replace("-", "")[..12].to_string());
        let bg_request = BackgroundRequest {
            id: id.clone(),
            status: BackgroundStatus::Queued,
            model: request.model.clone(),
            provider: format!("{:?}", provider),
            result: None,
            error: None,
            created_at: Some(Instant::now()),
        };

        let mut requests = self.requests.write().await;
        requests.insert(id.clone(), bg_request);

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
        requests
            .get(response_id)
            .cloned()
            .ok_or_else(|| {
                crate::sys::error::Error::Generic(format!(
                    "Background request not found: {}",
                    response_id
                ))
            })
    }

    pub async fn cancel_request(
        &self,
        response_id: &str,
    ) -> Result<(), crate::sys::error::Error> {
        let mut requests = self.requests.write().await;
        if let Some(req) = requests.get_mut(response_id) {
            req.status = BackgroundStatus::Cancelled;
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

    pub async fn process_queue(&self) -> Result<Vec<String>, crate::sys::error::Error> {
        // Stub: returns IDs of requests that would be processed
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
                BackgroundStatus::Completed | BackgroundStatus::Failed | BackgroundStatus::Cancelled
            ) {
                if let Some(created) = req.created_at {
                    return now.duration_since(created) < max_age;
                }
            }
            true
        });
        Ok(before - requests.len())
    }
}
