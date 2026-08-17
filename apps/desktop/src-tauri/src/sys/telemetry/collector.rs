use super::consent::{process_consent, TelemetryConsent};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

const LOCAL_EVENTS_FILE: &str = "analytics_events.json";
const LOCAL_EVENTS_MAX: usize = 10_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryEvent {
    pub name: String,
    pub properties: HashMap<String, Value>,
    pub timestamp: u64,
    pub session_id: String,
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventBatch {
    pub batch_id: String,
    pub events: Vec<TelemetryEvent>,
    pub timestamp: u64,
    pub session_id: String,
    pub user_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CollectorConfig {
    pub enabled: bool,
    pub batch_size: usize,
    pub flush_interval_secs: u64,
    /// When set, failed or unconfigured HTTP flushes fall back to appending
    /// events to `analytics_events.json` inside this directory (the Tauri
    /// app-data directory). When `None` the local-file fallback is skipped.
    pub app_data_dir: Option<PathBuf>,
    /// TRUST-BOUNDARY: when the session is in a Local trust boundary —
    /// `Some("local")` (device-only) OR `Some("byok")` (user's own keys,
    /// client-direct, no AGI compute) — the collector silently drops all events
    /// and flushes, mirroring the TS analytics.ts gate. Per the suite rule
    /// "Local Mode (on-device + BYOK) = zero cloud telemetry", BYOK telemetry
    /// must never reach our cloud. Only `Some("managed")` / other values
    /// (including `None`, the pre-sync default) allow normal operation. Never
    /// promote Local/BYOK events to the HTTP endpoint or the local file
    /// regardless of `enabled`. See `is_local_trust_boundary`.
    pub privacy_mode: Option<String>,
}

impl Default for CollectorConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            batch_size: 50,
            flush_interval_secs: 30,
            app_data_dir: None,
            privacy_mode: None,
        }
    }
}

pub struct TelemetryCollector {
    config: CollectorConfig,
    consent: TelemetryConsent,
    events: Arc<RwLock<Vec<TelemetryEvent>>>,
    session_id: String,
    user_id: Arc<RwLock<Option<String>>>,
}

impl TelemetryCollector {
    pub fn new(config: CollectorConfig) -> Self {
        Self::with_consent(config, process_consent())
    }

    pub fn with_consent(config: CollectorConfig, consent: TelemetryConsent) -> Self {
        let session_id = Uuid::new_v4().to_string();

        Self {
            config,
            consent,
            events: Arc::new(RwLock::new(Vec::new())),
            session_id,
            user_id: Arc::new(RwLock::new(None)),
        }
    }

    pub fn consent(&self) -> &TelemetryConsent {
        &self.consent
    }

    pub fn grant_consent(&self) {
        self.consent.grant();
    }

    pub async fn withdraw_consent(&self) {
        self.consent.withdraw();
        self.clear().await;
    }

    /// DPDP: every emit path routes through here. A collector constructed with
    /// `enabled: true` still emits nothing until consent is positively recorded,
    /// and a withdrawal recorded on any clone of the handle stops emission on the
    /// very next call.
    fn emission_allowed(&self) -> bool {
        self.config.enabled && self.consent.is_granted() && !self.is_local_trust_boundary()
    }

    /// True when the configured privacy mode is a Local trust boundary in which
    /// NO telemetry may reach our cloud: `"local"` (device-only) or `"byok"`
    /// (user-supplied keys, client-direct). Managed cloud and the `None`
    /// pre-sync default are NOT Local boundaries here.
    fn is_local_trust_boundary(&self) -> bool {
        matches!(
            self.config.privacy_mode.as_deref(),
            Some("local") | Some("byok")
        )
    }

    pub async fn track(&self, event: TelemetryEvent) -> Result<()> {
        if !self.emission_allowed() {
            return Ok(());
        }

        let mut events = self.events.write().await;
        events.push(event);

        if events.len() >= self.config.batch_size {
            drop(events);
            self.flush().await?;
        }

        Ok(())
    }

    pub async fn flush(&self) -> Result<()> {
        if !self.emission_allowed() {
            self.events.write().await.clear();
            return Ok(());
        }

        let mut events = self.events.write().await;

        if events.is_empty() {
            return Ok(());
        }

        let batch = EventBatch {
            batch_id: Uuid::new_v4().to_string(),
            events: events.drain(..).collect(),
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            session_id: self.session_id.clone(),
            user_id: self.user_id.read().await.clone(),
        };

        tracing::debug!(
            batch_id = %batch.batch_id,
            events_count = batch.events.len(),
            "Flushing analytics batch"
        );

        // Attempt HTTP delivery when TELEMETRY_ENDPOINT is configured.
        let http_succeeded = if let Ok(endpoint) = std::env::var("TELEMETRY_ENDPOINT") {
            if !endpoint.is_empty() {
                match Self::send_batch_to_backend(&endpoint, &batch).await {
                    Ok(_) => {
                        tracing::debug!("Successfully sent analytics batch {}", batch.batch_id);
                        true
                    }
                    Err(e) => {
                        tracing::warn!(
                            "Failed to send analytics batch {}: {}. \
                                 Falling back to local file.",
                            batch.batch_id,
                            e
                        );
                        false
                    }
                }
            } else {
                // Endpoint var is set but empty — treat as not configured.
                false
            }
        } else {
            // TELEMETRY_ENDPOINT not set.
            false
        };

        // Persist to local file when HTTP delivery was not available or failed.
        if !http_succeeded {
            if let Some(ref app_data_dir) = self.config.app_data_dir {
                if let Err(e) = Self::append_batch_to_local_file(app_data_dir, &batch) {
                    tracing::warn!(
                        "Failed to persist analytics batch {} to local file: {}",
                        batch.batch_id,
                        e
                    );
                } else {
                    tracing::debug!("Persisted analytics batch {} to local file", batch.batch_id);
                }
            }
            // If app_data_dir is None, events are intentionally dropped (collector
            // not fully configured yet — same behavior as before this change).
        }

        Ok(())
    }

    /// Append all events from `batch` to `analytics_events.json` inside
    /// `app_data_dir`, creating the file if it does not exist.  Trims the
    /// stored list to at most `LOCAL_EVENTS_MAX` entries (oldest first).
    fn append_batch_to_local_file(app_data_dir: &PathBuf, batch: &EventBatch) -> Result<()> {
        use std::fs;

        if !app_data_dir.exists() {
            fs::create_dir_all(app_data_dir)?;
        }

        let file_path = app_data_dir.join(LOCAL_EVENTS_FILE);

        // Load existing events (ignore parse errors — treat corrupt file as empty).
        let mut stored: Vec<TelemetryEvent> = if file_path.exists() {
            let raw = fs::read_to_string(&file_path)?;
            serde_json::from_str(&raw).unwrap_or_default()
        } else {
            Vec::new()
        };

        // Append new events from the batch.
        stored.extend(batch.events.clone());

        // Trim to the maximum allowed size, keeping the most recent events.
        if stored.len() > LOCAL_EVENTS_MAX {
            let drop_count = stored.len() - LOCAL_EVENTS_MAX;
            stored.drain(..drop_count);
        }

        let content = serde_json::to_string_pretty(&stored)?;
        fs::write(&file_path, content)?;

        Ok(())
    }

    async fn send_batch_to_backend(endpoint: &str, batch: &EventBatch) -> Result<()> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()?;

        let response = client
            .post(endpoint)
            .header("Content-Type", "application/json")
            .json(batch)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "Analytics backend returned error: {}",
                response.status()
            ));
        }

        Ok(())
    }

    pub fn get_session_id(&self) -> String {
        self.session_id.clone()
    }

    pub async fn set_user_id(&self, user_id: Option<String>) {
        let mut id = self.user_id.write().await;
        *id = user_id;
    }

    pub async fn get_user_id(&self) -> Option<String> {
        self.user_id.read().await.clone()
    }

    pub async fn set_user_property(&self, _key: String, _value: Value) -> Result<()> {
        if !self.emission_allowed() {
            return Ok(());
        }

        tracing::debug!("User property set: {} = {:?}", _key, _value);

        Ok(())
    }

    pub async fn get_event_count(&self) -> usize {
        self.events.read().await.len()
    }

    pub async fn clear(&self) {
        let mut events = self.events.write().await;
        events.clear();
    }

    pub fn update_config(&mut self, config: CollectorConfig) {
        self.config = config;
    }

    pub fn set_privacy_mode(&mut self, mode: Option<String>) {
        self.config.privacy_mode = mode;
    }

    pub fn is_enabled(&self) -> bool {
        self.emission_allowed()
    }

    pub async fn delete_all_data(&self) -> Result<()> {
        self.clear().await;

        self.set_user_id(None).await;

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
    use crate::sys::telemetry::consent::ConsentDecision;
    use tempfile::TempDir;

    fn config(enabled: bool, batch_size: usize) -> CollectorConfig {
        CollectorConfig {
            enabled,
            batch_size,
            flush_interval_secs: 30,
            app_data_dir: None,
            privacy_mode: None,
        }
    }

    fn consented(config: CollectorConfig) -> TelemetryCollector {
        let consent = TelemetryConsent::default();
        consent.grant();
        TelemetryCollector::with_consent(config, consent)
    }

    fn event(name: &str, session_id: String) -> TelemetryEvent {
        TelemetryEvent {
            name: name.to_string(),
            properties: HashMap::new(),
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            session_id,
            user_id: None,
        }
    }

    #[tokio::test]
    async fn test_track_event() {
        let collector = consented(config(true, 3));

        collector
            .track(event("test_event", collector.get_session_id()))
            .await
            .unwrap();

        assert_eq!(collector.get_event_count().await, 1);
    }

    #[tokio::test]
    async fn test_auto_flush_on_batch_size() {
        let collector = consented(config(true, 2));

        for i in 0..2 {
            collector
                .track(event(
                    &format!("test_event_{}", i),
                    collector.get_session_id(),
                ))
                .await
                .unwrap();
        }

        assert_eq!(collector.get_event_count().await, 0);
    }

    #[tokio::test]
    async fn test_manual_flush() {
        let collector = consented(config(true, 10));

        collector
            .track(event("test_event", collector.get_session_id()))
            .await
            .unwrap();
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
        let collector = consented(config(false, 10));

        collector
            .track(event("test_event", collector.get_session_id()))
            .await
            .unwrap();

        assert_eq!(collector.get_event_count().await, 0);
    }

    #[tokio::test]
    async fn test_clear() {
        let collector = consented(config(true, 10));

        for i in 0..5 {
            collector
                .track(event(
                    &format!("test_event_{}", i),
                    collector.get_session_id(),
                ))
                .await
                .unwrap();
        }

        assert_eq!(collector.get_event_count().await, 5);

        collector.clear().await;
        assert_eq!(collector.get_event_count().await, 0);
    }

    #[tokio::test]
    async fn test_delete_all_data() {
        let collector = consented(config(true, 10));

        collector.set_user_id(Some("test_user".to_string())).await;
        collector
            .track(event("test_event", collector.get_session_id()))
            .await
            .unwrap();

        collector.delete_all_data().await.unwrap();

        assert_eq!(collector.get_event_count().await, 0);
        assert_eq!(collector.get_user_id().await, None);
    }

    // CONSENT-GATE tests ---------------------------------------------------------

    #[tokio::test]
    async fn constructs_disabled_until_consent_is_recorded() {
        let collector = TelemetryCollector::new(config(true, 100));

        assert!(
            !collector.is_enabled(),
            "CONSENT: a collector must construct with emission off even when the config enables it"
        );

        for i in 0..5 {
            collector
                .track(event(&format!("event_{}", i), collector.get_session_id()))
                .await
                .unwrap();
        }

        assert_eq!(collector.get_event_count().await, 0);
    }

    #[tokio::test]
    async fn consent_gate_is_consulted_before_every_emit() {
        let collector =
            TelemetryCollector::with_consent(config(true, 100), TelemetryConsent::default());

        collector
            .track(event("before_consent", collector.get_session_id()))
            .await
            .unwrap();
        assert_eq!(collector.get_event_count().await, 0);

        collector.grant_consent();
        assert!(collector.is_enabled());

        collector
            .track(event("after_consent", collector.get_session_id()))
            .await
            .unwrap();
        assert_eq!(collector.get_event_count().await, 1);
    }

    #[tokio::test]
    async fn withdrawn_consent_stops_emitting_and_drops_pending_events() {
        let dir = TempDir::new().unwrap();
        let mut cfg = config(true, 100);
        cfg.app_data_dir = Some(dir.path().to_path_buf());
        let collector = consented(cfg);

        for i in 0..3 {
            collector
                .track(event(&format!("event_{}", i), collector.get_session_id()))
                .await
                .unwrap();
        }
        assert_eq!(collector.get_event_count().await, 3);

        collector.withdraw_consent().await;

        collector.flush().await.unwrap();
        collector
            .track(event("after_withdrawal", collector.get_session_id()))
            .await
            .unwrap();
        collector.flush().await.unwrap();

        assert!(!collector.is_enabled());
        assert_eq!(collector.get_event_count().await, 0);
        assert!(
            !dir.path().join(LOCAL_EVENTS_FILE).exists(),
            "CONSENT: nothing may be written after consent is withdrawn"
        );
    }

    #[tokio::test]
    async fn granted_consent_still_writes_the_local_events_file() {
        let dir = TempDir::new().unwrap();
        let mut cfg = config(true, 100);
        cfg.app_data_dir = Some(dir.path().to_path_buf());
        let collector = consented(cfg);

        collector
            .track(event("event", collector.get_session_id()))
            .await
            .unwrap();
        collector.flush().await.unwrap();

        assert!(dir.path().join(LOCAL_EVENTS_FILE).exists());
    }

    #[tokio::test]
    async fn withdrawal_through_a_shared_handle_stops_emission() {
        let consent = TelemetryConsent::default();
        consent.grant();
        let collector = TelemetryCollector::with_consent(config(true, 100), consent.clone());

        collector
            .track(event("granted", collector.get_session_id()))
            .await
            .unwrap();
        assert_eq!(collector.get_event_count().await, 1);

        consent.set(false);

        collector
            .track(event("withdrawn", collector.get_session_id()))
            .await
            .unwrap();
        assert_eq!(collector.get_event_count().await, 1);
        assert_eq!(collector.consent().decision(), ConsentDecision::Withdrawn);
    }

    #[tokio::test]
    async fn consent_alone_does_not_enable_a_disabled_collector() {
        let collector = consented(config(false, 100));

        collector
            .track(event("event", collector.get_session_id()))
            .await
            .unwrap();

        assert!(!collector.is_enabled());
        assert_eq!(collector.get_event_count().await, 0);
    }

    // TRUST-BOUNDARY tests -------------------------------------------------------

    #[tokio::test]
    async fn local_mode_blocks_track_even_when_enabled() {
        let mut cfg = config(true, 100);
        cfg.privacy_mode = Some("local".to_string());
        let collector = consented(cfg);

        for i in 0..10 {
            collector
                .track(event(&format!("event_{}", i), collector.get_session_id()))
                .await
                .unwrap();
        }

        assert_eq!(
            collector.get_event_count().await,
            0,
            "TRUST-BOUNDARY: local mode must produce zero buffered events"
        );
    }

    #[tokio::test]
    async fn byok_mode_blocks_track_even_when_enabled() {
        let mut cfg = config(true, 100);
        cfg.privacy_mode = Some("byok".to_string());
        let collector = consented(cfg);

        for i in 0..10 {
            collector
                .track(event(&format!("event_{}", i), collector.get_session_id()))
                .await
                .unwrap();
        }

        assert_eq!(
            collector.get_event_count().await,
            0,
            "TRUST-BOUNDARY: byok mode must produce zero buffered events"
        );

        collector.flush().await.unwrap();
    }

    #[tokio::test]
    async fn cloud_mode_allows_track_when_enabled() {
        let mut cfg = config(true, 100);
        cfg.privacy_mode = Some("cloud".to_string());
        let collector = consented(cfg);

        collector
            .track(event("test_event", collector.get_session_id()))
            .await
            .unwrap();

        assert_eq!(collector.get_event_count().await, 1);
    }

    #[tokio::test]
    async fn none_mode_allows_track_when_enabled() {
        let collector = consented(config(true, 100));

        collector
            .track(event("test_event", collector.get_session_id()))
            .await
            .unwrap();

        assert_eq!(collector.get_event_count().await, 1);
    }

    #[tokio::test]
    async fn local_mode_flush_is_noop() {
        let mut cfg = config(true, 100);
        cfg.privacy_mode = Some("local".to_string());
        let collector = consented(cfg);

        collector.flush().await.unwrap();
        assert_eq!(collector.get_event_count().await, 0);
    }
}
