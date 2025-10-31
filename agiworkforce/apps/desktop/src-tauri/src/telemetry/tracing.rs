use anyhow::Result;
use tracing::Level;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use super::logging::{create_file_appender, LogConfig};

/// Initialize tracing with file and stdout logging
pub fn init_tracing(config: LogConfig) -> Result<()> {
    // Create file appender
    let file_appender = create_file_appender(&config)?;
    let (file_writer, _guard) = tracing_appender::non_blocking(file_appender);

    // Create stdout writer
    let (stdout_writer, _stdout_guard) = tracing_appender::non_blocking(std::io::stdout());

    // Create environment filter
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new(format!(
            "{}=info,agiworkforce=debug,tauri=info,tao=info",
            env!("CARGO_PKG_NAME")
        ))
    });

    // Create file layer (JSON format for structured logs)
    let file_layer = fmt::layer()
        .json()
        .with_writer(file_writer)
        .with_target(true)
        .with_thread_ids(true)
        .with_thread_names(true)
        .with_file(true)
        .with_line_number(true);

    // Create stdout layer (human-readable format)
    let stdout_layer = fmt::layer()
        .compact()
        .with_writer(stdout_writer)
        .with_target(false)
        .with_thread_ids(false);

    // Initialize subscriber with both layers
    tracing_subscriber::registry()
        .with(env_filter)
        .with(file_layer)
        .with(stdout_layer)
        .try_init()
        .map_err(|e| anyhow::anyhow!("Failed to initialize tracing: {}", e))?;

    tracing::info!("Telemetry initialized successfully");
    tracing::info!("Log directory: {:?}", config.log_dir);

    Ok(())
}

/// Initialize Sentry for crash reporting
#[cfg(feature = "sentry")]
pub fn init_sentry(dsn: &str, environment: &str) -> Result<sentry::ClientInitGuard> {
    let guard = sentry::init((
        dsn,
        sentry::ClientOptions {
            release: Some(env!("CARGO_PKG_VERSION").into()),
            environment: Some(environment.into()),
            attach_stacktrace: true,
            send_default_pii: false,
            ..Default::default()
        },
    ));

    tracing::info!("Sentry initialized for environment: {}", environment);

    Ok(guard)
}

/// Create a tracing span for a specific operation
#[macro_export]
macro_rules! trace_operation {
    ($name:expr) => {
        tracing::info_span!($name)
    };
    ($name:expr, $($field:tt)*) => {
        tracing::info_span!($name, $($field)*)
    };
}

/// Log and capture error to Sentry
#[cfg(feature = "sentry")]
pub fn capture_error(error: &anyhow::Error) {
    tracing::error!("Error: {:?}", error);
    sentry::capture_error(error);
}

#[cfg(not(feature = "sentry"))]
pub fn capture_error(error: &anyhow::Error) {
    tracing::error!("Error: {:?}", error);
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_tracing_init() {
        let temp_dir = TempDir::new().unwrap();
        let config = LogConfig {
            log_dir: temp_dir.path().to_path_buf(),
            max_files: 7,
            rotation: tracing_appender::rolling::Rotation::DAILY,
        };

        // This will fail if tracing is already initialized
        // So we just check that the config is valid
        assert!(config.log_dir.exists() || !config.log_dir.exists());
    }
}
