use std::fs;
use std::path::PathBuf;
use tracing::Level;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::fmt::format::FmtSpan;
use tracing_subscriber::prelude::*;
use tracing_subscriber::EnvFilter;

pub struct LogConfig {
    pub log_dir: PathBuf,

    pub level: Level,

    pub json_format: bool,

    pub max_files: usize,

    pub max_file_size: u64,

    pub rotation: Rotation,

    pub console_logging: bool,

    pub filter_sensitive: bool,
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            log_dir: PathBuf::from("logs"),
            level: Level::INFO,
            json_format: false,
            max_files: 10,
            max_file_size: 10 * 1024 * 1024,
            rotation: Rotation::DAILY,
            console_logging: true,
            filter_sensitive: true,
        }
    }
}

pub fn init_logging(config: LogConfig) -> Result<(), Box<dyn std::error::Error>> {
    fs::create_dir_all(&config.log_dir)?;

    let file_appender =
        RollingFileAppender::new(config.rotation, &config.log_dir, "agiworkforce.log");

    let filter = EnvFilter::from_default_env().add_directive(config.level.into());

    let mut layers = Vec::new();

    if config.json_format {
        let file_layer = tracing_subscriber::fmt::layer()
            .json()
            .with_writer(file_appender)
            .with_span_events(FmtSpan::CLOSE)
            .with_thread_ids(true)
            .with_thread_names(true)
            .boxed();
        layers.push(file_layer);
    } else {
        let file_layer = tracing_subscriber::fmt::layer()
            .with_writer(file_appender)
            .with_ansi(false)
            .with_span_events(FmtSpan::CLOSE)
            .with_thread_ids(true)
            .with_thread_names(true)
            .boxed();
        layers.push(file_layer);
    }

    if config.console_logging {
        let console_layer = tracing_subscriber::fmt::layer()
            .with_writer(std::io::stdout)
            .with_ansi(true)
            .pretty()
            .boxed();
        layers.push(console_layer);
    }

    tracing_subscriber::registry()
        .with(filter)
        .with(layers)
        .init();

    tracing::info!("Logging initialized at {:?}", config.log_dir);

    cleanup_old_logs(&config.log_dir, config.max_files)?;

    Ok(())
}

fn cleanup_old_logs(log_dir: &PathBuf, max_files: usize) -> Result<(), Box<dyn std::error::Error>> {
    let mut log_files: Vec<_> = fs::read_dir(log_dir)?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            if let Some(ext) = entry.path().extension() {
                ext == "log"
            } else {
                false
            }
        })
        .collect();

    log_files.sort_by_key(|entry| {
        entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .map(std::cmp::Reverse)
    });

    for entry in log_files.iter().skip(max_files) {
        let path = entry.path();
        tracing::debug!("Removing old log file: {:?}", path);
        if let Err(e) = fs::remove_file(&path) {
            tracing::warn!("Failed to remove old log file {:?}: {}", path, e);
        }
    }

    Ok(())
}

pub fn filter_sensitive_data(input: &str) -> String {
    use regex::Regex;

    let patterns = [
        (
            r#"(?i)(api[_-]?key|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9_-]+)['"]?"#,
            "API_KEY=***",
        ),
        (
            r#"(?i)(password|passwd|pwd)\s*[:=]\s*['"]?([^\s'"]+)['"]?"#,
            "PASSWORD=***",
        ),
        (
            r#"(?i)(token|auth[_-]?token)\s*[:=]\s*['"]?([a-zA-Z0-9._-]+)['"]?"#,
            "TOKEN=***",
        ),
        (
            r#"(?i)(secret|client[_-]?secret)\s*[:=]\s*['"]?([a-zA-Z0-9_-]+)['"]?"#,
            "SECRET=***",
        ),
        (
            r#"(?i)(bearer|authorization)\s*[:=]?\s*(?:bearer\s+)?['"]?([a-zA-Z0-9._-]+)['"]?"#,
            "BEARER=***",
        ),
        (
            r#"(?i)(private[_-]?key)\s*[:=]\s*['"]?([^\s'"]+)['"]?"#,
            "PRIVATE_KEY=***",
        ),
        // Match URI credentials: protocol://user:password@host
        (
            r#"(?i)([a-z]+://)([^:@\s]+):([^@\s]+)@([a-z0-9.-]+)"#,
            "${1}${2}:***@${4}",
        ),
    ];

    let mut filtered = input.to_string();

    for (pattern, replacement) in patterns.iter() {
        if let Ok(re) = Regex::new(pattern) {
            filtered = re.replace_all(&filtered, *replacement).to_string();
        }
    }

    filtered
}

pub struct PerformanceMetrics {
    pub operation: String,
    pub duration_ms: u64,
    pub memory_used_bytes: Option<u64>,
    pub success: bool,
}

impl PerformanceMetrics {
    pub fn log(&self) {
        if self.success {
            tracing::info!(
                operation = %self.operation,
                duration_ms = self.duration_ms,
                memory_used_bytes = ?self.memory_used_bytes,
                "Operation completed successfully"
            );
        } else {
            tracing::warn!(
                operation = %self.operation,
                duration_ms = self.duration_ms,
                "Operation failed"
            );
        }
    }
}

#[macro_export]
macro_rules! log_safe {
    ($level:expr, $($arg:tt)*) => {
        {
            let message = format!($($arg)*);
            let filtered = $crate::sys::logging::filter_sensitive_data(&message);
            match $level {
                tracing::Level::TRACE => tracing::trace!("{}", filtered),
                tracing::Level::DEBUG => tracing::debug!("{}", filtered),
                tracing::Level::INFO => tracing::info!("{}", filtered),
                tracing::Level::WARN => tracing::warn!("{}", filtered),
                tracing::Level::ERROR => tracing::error!("{}", filtered),
            }
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filter_api_key() {
        let input = "api_key: sk-1234567890abcdef";
        let filtered = filter_sensitive_data(input);
        assert!(filtered.contains("API_KEY=***"));
        assert!(!filtered.contains("sk-1234567890abcdef"));
    }

    #[test]
    fn test_filter_password() {
        let input = "password=MySecretPass123";
        let filtered = filter_sensitive_data(input);
        assert!(filtered.contains("PASSWORD=***"));
        assert!(!filtered.contains("MySecretPass123"));
    }

    #[test]
    fn test_filter_token() {
        let input = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
        let filtered = filter_sensitive_data(input);
        assert!(filtered.contains("BEARER=***"));
        assert!(!filtered.contains("eyJhbGci"));
    }

    #[test]
    fn test_filter_multiple_secrets() {
        let input = "api_key=abc123 password=secret token=xyz789";
        let filtered = filter_sensitive_data(input);
        assert!(filtered.contains("API_KEY=***"));
        assert!(filtered.contains("PASSWORD=***"));
        assert!(filtered.contains("TOKEN=***"));
    }
    #[test]
    fn test_filter_uri_credentials() {
        let input = "Connecting to postgres://user:password123@localhost:5432/mydb";
        let filtered = filter_sensitive_data(input);
        assert!(filtered.contains("postgres://user:***@localhost"));
        assert!(!filtered.contains("password123"));
    }
}
