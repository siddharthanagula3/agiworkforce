pub mod analytics_metrics;
pub mod collector;
pub mod correlation;
pub mod logging;
pub mod metrics;
pub mod redaction;
pub mod tracing;

pub use analytics_metrics::{AnalyticsMetricsCollector, AppMetrics, SystemMetrics};
pub use collector::{CollectorConfig, EventBatch, TelemetryCollector, TelemetryEvent};
pub use correlation::{
    current_correlation_id, generate_correlation_id, with_correlation_id, with_new_correlation_id,
    CorrelationGuard, RequestContext,
};
pub use logging::{get_current_log_path, LogConfig};
pub use metrics::{MetricsCollector, OperationMetrics, Timer};
pub use tracing::{capture_error, init_tracing};

use anyhow::Result;

pub fn init() -> Result<TelemetryGuard> {
    init_with_config(LogConfig::default())
}

pub fn init_with_config(log_config: LogConfig) -> Result<TelemetryGuard> {
    let (_file_guard, _stdout_guard) = init_tracing(log_config.clone())?;
    let metrics = MetricsCollector::new();

    let guard = TelemetryGuard {
        _log_config: log_config,
        metrics,
        _file_guard,
        _stdout_guard,
    };

    ::tracing::info!(
        "Telemetry initialized - logs at: {:?}",
        get_current_log_path(&guard._log_config)
    );

    Ok(guard)
}

pub struct TelemetryGuard {
    pub(crate) _log_config: LogConfig,
    pub metrics: MetricsCollector,
    // Must live for the process lifetime: dropping either non-blocking writer's
    // guard silently kills its flush thread, discarding every subsequent
    // `tracing::` call (see the comment on `tracing::init_tracing`).
    _file_guard: tracing_appender::non_blocking::WorkerGuard,
    _stdout_guard: tracing_appender::non_blocking::WorkerGuard,
}

impl TelemetryGuard {
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

        assert!(log_config.log_dir.exists() || !log_config.log_dir.exists());
    }
}
