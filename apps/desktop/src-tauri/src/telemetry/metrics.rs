use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// Performance metrics for operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationMetrics {
    pub name: String,
    pub count: u64,
    pub total_duration_ms: u64,
    pub min_duration_ms: u64,
    pub max_duration_ms: u64,
    pub avg_duration_ms: f64,
    pub last_executed: Option<chrono::DateTime<chrono::Utc>>,
}

impl OperationMetrics {
    fn new(name: String) -> Self {
        Self {
            name,
            count: 0,
            total_duration_ms: 0,
            min_duration_ms: u64::MAX,
            max_duration_ms: 0,
            avg_duration_ms: 0.0,
            last_executed: None,
        }
    }

    fn record(&mut self, duration: Duration) {
        let duration_ms = duration.as_millis() as u64;

        self.count += 1;
        self.total_duration_ms += duration_ms;
        self.min_duration_ms = self.min_duration_ms.min(duration_ms);
        self.max_duration_ms = self.max_duration_ms.max(duration_ms);
        self.avg_duration_ms = self.total_duration_ms as f64 / self.count as f64;
        self.last_executed = Some(chrono::Utc::now());
    }
}

/// Global metrics collector
#[derive(Clone)]
pub struct MetricsCollector {
    metrics: Arc<RwLock<HashMap<String, OperationMetrics>>>,
}

impl MetricsCollector {
    pub fn new() -> Self {
        Self {
            metrics: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Record a timed operation
    pub async fn record(&self, operation: &str, duration: Duration) {
        let mut metrics = self.metrics.write().await;
        metrics
            .entry(operation.to_string())
            .or_insert_with(|| OperationMetrics::new(operation.to_string()))
            .record(duration);
    }

    /// Get metrics for a specific operation
    pub async fn get(&self, operation: &str) -> Option<OperationMetrics> {
        self.metrics.read().await.get(operation).cloned()
    }

    /// Get all metrics
    pub async fn get_all(&self) -> Vec<OperationMetrics> {
        self.metrics.read().await.values().cloned().collect()
    }

    /// Clear all metrics
    pub async fn clear(&self) {
        self.metrics.write().await.clear();
    }
}

impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

/// Timer for measuring operation duration
pub struct Timer {
    start: Instant,
    operation: String,
    collector: MetricsCollector,
}

impl Timer {
    pub fn new(operation: impl Into<String>, collector: MetricsCollector) -> Self {
        Self {
            start: Instant::now(),
            operation: operation.into(),
            collector,
        }
    }

    /// Stop the timer and record the duration
    pub async fn stop(self) {
        let duration = self.start.elapsed();
        self.collector.record(&self.operation, duration).await;
        tracing::debug!(
            operation = %self.operation,
            duration_ms = duration.as_millis(),
            "Operation completed"
        );
    }
}

/// Create a timer for an operation
#[macro_export]
macro_rules! time_operation {
    ($collector:expr, $operation:expr) => {
        $crate::telemetry::metrics::Timer::new($operation, $collector.clone())
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn test_metrics_recording() {
        let collector = MetricsCollector::new();

        // Record some operations
        collector
            .record("test_op", Duration::from_millis(100))
            .await;
        collector
            .record("test_op", Duration::from_millis(200))
            .await;
        collector
            .record("test_op", Duration::from_millis(150))
            .await;

        // Check metrics
        let metrics = collector.get("test_op").await.unwrap();
        assert_eq!(metrics.count, 3);
        assert_eq!(metrics.min_duration_ms, 100);
        assert_eq!(metrics.max_duration_ms, 200);
        assert_eq!(metrics.avg_duration_ms, 150.0);
    }

    #[tokio::test]
    async fn test_timer() {
        let collector = MetricsCollector::new();
        let timer = Timer::new("async_op", collector.clone());

        tokio::time::sleep(Duration::from_millis(50)).await;

        timer.stop().await;

        let metrics = collector.get("async_op").await.unwrap();
        assert_eq!(metrics.count, 1);
        assert!(metrics.avg_duration_ms >= 50.0);
    }

    #[tokio::test]
    async fn test_multiple_operations() {
        let collector = MetricsCollector::new();

        collector.record("op1", Duration::from_millis(100)).await;
        collector.record("op2", Duration::from_millis(200)).await;
        collector.record("op1", Duration::from_millis(150)).await;

        let all_metrics = collector.get_all().await;
        assert_eq!(all_metrics.len(), 2);

        let op1_metrics = collector.get("op1").await.unwrap();
        assert_eq!(op1_metrics.count, 2);

        let op2_metrics = collector.get("op2").await.unwrap();
        assert_eq!(op2_metrics.count, 1);
    }
}
