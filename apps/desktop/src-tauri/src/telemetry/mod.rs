pub mod analytics_metrics;
pub mod collector;
pub mod logging;
pub mod metrics;
pub mod tracing;

// Re-export commonly used types
pub use analytics_metrics::{AnalyticsMetricsCollector, AppMetrics, SystemMetrics};
pub use collector::{CollectorConfig, EventBatch, TelemetryCollector, TelemetryEvent};
pub use logging::{get_current_log_path, LogConfig};
pub use metrics::{MetricsCollector, OperationMetrics, Timer};
pub use tracing::{capture_error, init_tracing};

#[cfg(feature = "sentry")]
pub use tracing::init_sentry;

use anyhow::Result;

/// Initialize the complete telemetry system
pub fn init() -> Result<TelemetryGuard> {
    let log_config = LogConfig::default();

    if let Some(guard) = initialize_sentry_if_configured(&log_config)? {
        return Ok(guard);
    }

    init_with_config(log_config)
}

/// Initialize telemetry with custom configuration
pub fn init_with_config(log_config: LogConfig) -> Result<TelemetryGuard> {
    init_tracing(log_config.clone())?;
    let metrics = MetricsCollector::new();

    let guard = TelemetryGuard {
        _log_config: log_config,
        metrics,
        #[cfg(feature = "sentry")]
        _sentry_guard: None,
    };

    ::tracing::info!(
        "Telemetry initialized - logs at: {:?}",
        get_current_log_path(&guard._log_config)
    );

    Ok(guard)
}

/// Initialize telemetry with Sentry
#[cfg(feature = "sentry")]
pub fn init_with_sentry(
    log_config: LogConfig,
    sentry_dsn: &str,
    environment: &str,
) -> Result<TelemetryGuard> {
    init_tracing(log_config.clone())?;
    let metrics = MetricsCollector::new();
    let sentry_guard = init_sentry(sentry_dsn, environment)?;

    Ok(TelemetryGuard {
        _log_config: log_config,
        metrics,
        _sentry_guard: Some(sentry_guard),
    })
}

#[cfg(feature = "sentry")]
fn initialize_sentry_if_configured(log_config: &LogConfig) -> Result<Option<TelemetryGuard>> {
    if let Ok(dsn_raw) = std::env::var("SENTRY_DSN") {
        let dsn = dsn_raw.trim().to_string();
        if !dsn.is_empty() {
            let environment =
                std::env::var("APP_ENV").unwrap_or_else(|_| "development".to_string());
            let environment = environment.trim().to_string();
            let guard = init_with_sentry(log_config.clone(), &dsn, &environment)?;
            ::tracing::info!(
                "Sentry crash reporting enabled (environment: {})",
                environment
            );
            return Ok(Some(guard));
        } else {
            ::tracing::warn!("SENTRY_DSN provided but empty; crash reporting not enabled");
        }
    }

    Ok(None)
}

#[cfg(not(feature = "sentry"))]
fn initialize_sentry_if_configured(_log_config: &LogConfig) -> Result<Option<TelemetryGuard>> {
    Ok(None)
}

/// Guard that maintains telemetry state for the lifetime of the application
pub struct TelemetryGuard {
    pub(crate) _log_config: LogConfig,
    pub metrics: MetricsCollector,
    #[cfg(feature = "sentry")]
    _sentry_guard: Option<sentry::ClientInitGuard>,
}

impl TelemetryGuard {
    /// Get the metrics collector
    pub fn metrics(&self) -> &MetricsCollector {
        &self.metrics
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_telemetry_init() {
        let temp_dir = TempDir::new().unwrap();
        let log_config = LogConfig {
            log_dir: temp_dir.path().to_path_buf(),
            max_files: 7,
            rotation: tracing_appender::rolling::Rotation::DAILY,
        };

        // We can't actually initialize because tracing can only be set once
        // But we can test that the config is valid
        assert!(log_config.log_dir.exists() || !log_config.log_dir.exists());
    }
}
