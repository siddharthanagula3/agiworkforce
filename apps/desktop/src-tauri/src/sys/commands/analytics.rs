use crate::sys::telemetry::{TelemetryCollector, TelemetryEvent};
use serde_json::Value;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

pub struct TelemetryState {
    pub collector: Arc<RwLock<TelemetryCollector>>,
}

impl TelemetryState {
    pub fn new(collector: TelemetryCollector) -> Self {
        Self {
            collector: Arc::new(RwLock::new(collector)),
        }
    }
}

#[tauri::command]
pub async fn analytics_track_event(
    event: TelemetryEvent,
    state: State<'_, TelemetryState>,
) -> Result<(), String> {
    let collector = state.collector.read().await;

    if !collector.is_enabled() {
        return Ok(());
    }

    drop(collector);
    let collector = state.collector.write().await;

    collector
        .track(event)
        .await
        .map_err(|e| format!("Failed to track event: {}", e))
}

#[tauri::command]
pub async fn analytics_flush_events(state: State<'_, TelemetryState>) -> Result<(), String> {
    let collector = state.collector.read().await;
    collector
        .flush()
        .await
        .map_err(|e| format!("Failed to flush events: {}", e))
}

#[tauri::command]
pub async fn analytics_get_session_id(state: State<'_, TelemetryState>) -> Result<String, String> {
    let collector = state.collector.read().await;
    Ok(collector.get_session_id())
}

#[tauri::command]
pub async fn analytics_set_user_property(
    key: String,
    value: Value,
    state: State<'_, TelemetryState>,
) -> Result<(), String> {
    let collector = state.collector.read().await;
    collector
        .set_user_property(key, value)
        .await
        .map_err(|e| format!("Failed to set user property: {}", e))
}

/// TRUST-BOUNDARY: Called by the TS analytics service whenever AppMode changes.
/// Mirrors the local-mode gate already enforced in analytics.ts so that no
/// future Rust call-site can bypass the TS layer check.
#[tauri::command]
pub async fn analytics_set_privacy_mode(
    mode: String,
    state: State<'_, TelemetryState>,
) -> Result<(), String> {
    let mut collector = state.collector.write().await;
    collector.set_privacy_mode(Some(mode));
    Ok(())
}

#[tauri::command]
pub async fn analytics_delete_all_data(state: State<'_, TelemetryState>) -> Result<(), String> {
    let collector = state.collector.read().await;
    collector
        .delete_all_data()
        .await
        .map_err(|e| format!("Failed to delete analytics data: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::telemetry::CollectorConfig;

    fn create_test_state() -> TelemetryState {
        let config = CollectorConfig {
            enabled: true,
            batch_size: 10,
            flush_interval_secs: 30,
            privacy_mode: Some("cloud".to_string()),
        };
        TelemetryState::new(TelemetryCollector::new(config))
    }

    /// `src/services/analytics.ts` sends this object as `event`, so its names
    /// stay snake_case.
    #[test]
    fn an_event_from_the_ui_is_read() {
        let event: TelemetryEvent = serde_json::from_value(serde_json::json!({
            "name": "app_opened",
            "properties": { "source": "unit-test" },
            "timestamp": 1_790_000_000_000_u64,
            "session_id": "session-1",
            "user_id": "user-1",
        }))
        .expect("event as the UI sends it");
        assert_eq!(event.session_id, "session-1");
        assert_eq!(event.user_id.as_deref(), Some("user-1"));

        let anonymous: TelemetryEvent = serde_json::from_value(serde_json::json!({
            "name": "app_opened",
            "properties": {},
            "timestamp": 1_790_000_000_000_u64,
            "session_id": "session-1",
        }))
        .expect("event with no user");
        assert_eq!(anonymous.user_id, None);
    }

    #[tokio::test]
    async fn test_analytics_track_event() {
        let state = create_test_state();
        let event = TelemetryEvent {
            name: "test_event".to_string(),
            properties: std::collections::HashMap::new(),
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            session_id: "test_session".to_string(),
            user_id: None,
        };

        let collector = state.collector.read().await;
        let result = collector.track(event).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_analytics_get_session_id() {
        let state = create_test_state();
        let session_id = state.collector.read().await.get_session_id();
        assert!(!session_id.is_empty());
    }
}
