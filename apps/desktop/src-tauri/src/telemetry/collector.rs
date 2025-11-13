use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Telemetry event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryEvent {
    pub name: String,
    pub properties: HashMap<String, Value>,
    pub timestamp: u64,
    pub session_id: String,
    pub user_id: Option<String>,
}

/// Event batch for efficient sending
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventBatch {
    pub batch_id: String,
    pub events: Vec<TelemetryEvent>,
    pub timestamp: u64,
    pub session_id: String,
    pub user_id: Option<String>,
}

/// Telemetry collector configuration
#[derive(Debug, Clone)]
pub struct CollectorConfig {
    pub enabled: bool,
    pub batch_size: usize,
    pub flush_interval_secs: u64,
}

impl Default for CollectorConfig {
    fn default() -> Self {
        Self {
            enabled: false, // Opt-in by default
            batch_size: 50,
            flush_interval_secs: 30,
        }
    }
}

/// Telemetry collector for batching and persisting events
pub struct TelemetryCollector {
    config: CollectorConfig,
    events: Arc<RwLock<Vec<TelemetryEvent>>>,
    session_id: String,
    user_id: Arc<RwLock<Option<String>>>,
}

impl TelemetryCollector {
    /// Create a new telemetry collector
    pub fn new(config: CollectorConfig) -> Self {
        let session_id = Uuid::new_v4().to_string();

        Self {
            config,
            events: Arc::new(RwLock::new(Vec::new())),
            session_id,
            user_id: Arc::new(RwLock::new(None)),
        }
    }

    /// Track an event
    pub async fn track(&self, event: TelemetryEvent) -> Result<()> {
        if !self.config.enabled {
            return Ok(());
        }

        let mut events = self.events.write().await;
        events.push(event);

        // Check if we need to flush
        if events.len() >= self.config.batch_size {
            drop(events); // Release write lock
            self.flush().await?;
        }

        Ok(())
    }

    /// Flush all pending events
    pub async fn flush(&self) -> Result<()> {
        if !self.config.enabled {
            return Ok(());
        }

        let mut events = self.events.write().await;

        if events.is_empty() {
            return Ok(());
        }

        // Create batch
        let batch = EventBatch {
            batch_id: Uuid::new_v4().to_string(),
            events: events.drain(..).collect(),
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            session_id: self.session_id.clone(),
            user_id: self.user_id.read().await.clone(),
        };

        // In a production system, you would send this to your analytics backend
        // For now, we'll just log it
        tracing::debug!(
            batch_id = %batch.batch_id,
            events_count = batch.events.len(),
            "Flushing analytics batch"
        );

        // TODO: Send batch to analytics backend
        // self.send_batch(batch).await?;

        Ok(())
    }

    /// Get the current session ID
    pub fn get_session_id(&self) -> String {
        self.session_id.clone()
    }

    /// Set the user ID
    pub async fn set_user_id(&self, user_id: Option<String>) {
        let mut id = self.user_id.write().await;
        *id = user_id;
    }

    /// Get the user ID
    pub async fn get_user_id(&self) -> Option<String> {
        self.user_id.read().await.clone()
    }

    /// Set user property
    pub async fn set_user_property(&self, _key: String, _value: Value) -> Result<()> {
        if !self.config.enabled {
            return Ok(());
        }

        // TODO: Store user properties in database or send to backend
        tracing::debug!("User property set: {} = {:?}", _key, _value);

        Ok(())
    }

    /// Get event count
    pub async fn get_event_count(&self) -> usize {
        self.events.read().await.len()
    }

    /// Clear all events
    pub async fn clear(&self) {
        let mut events = self.events.write().await;
        events.clear();
    }

    /// Update configuration
    pub fn update_config(&mut self, config: CollectorConfig) {
        self.config = config;
    }

    /// Check if collector is enabled
    pub fn is_enabled(&self) -> bool {
        self.config.enabled
    }

    /// Delete all user data (GDPR/CCPA compliance)
    pub async fn delete_all_data(&self) -> Result<()> {
        // Clear in-memory events
        self.clear().await;

        // Clear user ID
        self.set_user_id(None).await;

        // TODO: Delete data from database and backend
        tracing::info!("All analytics data deleted");

        Ok(())
    }
}

impl Default for TelemetryCollector {
    fn default() -> Self {
        Self::new(CollectorConfig::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_track_event() {
        let config = CollectorConfig {
            enabled: true,
            batch_size: 3,
            flush_interval_secs: 30,
        };
        let collector = TelemetryCollector::new(config);

        let event = TelemetryEvent {
            name: "test_event".to_string(),
            properties: HashMap::new(),
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            session_id: collector.get_session_id(),
            user_id: None,
        };

        collector.track(event).await.unwrap();

        assert_eq!(collector.get_event_count().await, 1);
    }

    #[tokio::test]
    async fn test_auto_flush_on_batch_size() {
        let config = CollectorConfig {
            enabled: true,
            batch_size: 2,
            flush_interval_secs: 30,
        };
        let collector = TelemetryCollector::new(config);

        // Track events
        for i in 0..2 {
            let event = TelemetryEvent {
                name: format!("test_event_{}", i),
                properties: HashMap::new(),
                timestamp: chrono::Utc::now().timestamp_millis() as u64,
                session_id: collector.get_session_id(),
                user_id: None,
            };
            collector.track(event).await.unwrap();
        }

        // Should have flushed
        assert_eq!(collector.get_event_count().await, 0);
    }

    #[tokio::test]
    async fn test_manual_flush() {
        let config = CollectorConfig {
            enabled: true,
            batch_size: 10,
            flush_interval_secs: 30,
        };
        let collector = TelemetryCollector::new(config);

        let event = TelemetryEvent {
            name: "test_event".to_string(),
            properties: HashMap::new(),
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            session_id: collector.get_session_id(),
            user_id: None,
        };

        collector.track(event).await.unwrap();
        assert_eq!(collector.get_event_count().await, 1);

        collector.flush().await.unwrap();
        assert_eq!(collector.get_event_count().await, 0);
    }

    #[tokio::test]
    async fn test_user_id() {
        let collector = TelemetryCollector::default();

        assert_eq!(collector.get_user_id().await, None);

        collector.set_user_id(Some("test_user".to_string())).await;
        assert_eq!(collector.get_user_id().await, Some("test_user".to_string()));

        collector.set_user_id(None).await;
        assert_eq!(collector.get_user_id().await, None);
    }

    #[tokio::test]
    async fn test_disabled_collector() {
        let config = CollectorConfig {
            enabled: false,
            batch_size: 10,
            flush_interval_secs: 30,
        };
        let collector = TelemetryCollector::new(config);

        let event = TelemetryEvent {
            name: "test_event".to_string(),
            properties: HashMap::new(),
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            session_id: collector.get_session_id(),
            user_id: None,
        };

        collector.track(event).await.unwrap();

        // Should not track when disabled
        assert_eq!(collector.get_event_count().await, 0);
    }

    #[tokio::test]
    async fn test_clear() {
        let config = CollectorConfig {
            enabled: true,
            batch_size: 10,
            flush_interval_secs: 30,
        };
        let collector = TelemetryCollector::new(config);

        for i in 0..5 {
            let event = TelemetryEvent {
                name: format!("test_event_{}", i),
                properties: HashMap::new(),
                timestamp: chrono::Utc::now().timestamp_millis() as u64,
                session_id: collector.get_session_id(),
                user_id: None,
            };
            collector.track(event).await.unwrap();
        }

        assert_eq!(collector.get_event_count().await, 5);

        collector.clear().await;
        assert_eq!(collector.get_event_count().await, 0);
    }

    #[tokio::test]
    async fn test_delete_all_data() {
        let config = CollectorConfig {
            enabled: true,
            batch_size: 10,
            flush_interval_secs: 30,
        };
        let collector = TelemetryCollector::new(config);

        collector.set_user_id(Some("test_user".to_string())).await;

        let event = TelemetryEvent {
            name: "test_event".to_string(),
            properties: HashMap::new(),
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            session_id: collector.get_session_id(),
            user_id: None,
        };
        collector.track(event).await.unwrap();

        collector.delete_all_data().await.unwrap();

        assert_eq!(collector.get_event_count().await, 0);
        assert_eq!(collector.get_user_id().await, None);
    }
}
