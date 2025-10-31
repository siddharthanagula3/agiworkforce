use anyhow::Result;
use std::fs::{self, File};
use std::path::PathBuf;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::fmt::writer::MakeWriter;

/// Log directory configuration
#[derive(Clone)]
pub struct LogConfig {
    pub log_dir: PathBuf,
    pub max_files: usize,
    pub rotation: Rotation,
}

impl Default for LogConfig {
    fn default() -> Self {
        let log_dir = crate::utils::app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("logs");

        Self {
            log_dir,
            max_files: 7, // Keep 7 days of logs
            rotation: Rotation::DAILY,
        }
    }
}

/// Create a rolling file appender for logs
pub fn create_file_appender(config: &LogConfig) -> Result<RollingFileAppender> {
    // Ensure log directory exists
    fs::create_dir_all(&config.log_dir)?;

    // Clean up old log files
    cleanup_old_logs(&config.log_dir, config.max_files)?;

    // Create rolling file appender
    // Clone rotation to avoid moving from borrowed content
    let rotation = if matches!(config.rotation, Rotation::DAILY) {
        Rotation::DAILY
    } else if matches!(config.rotation, Rotation::HOURLY) {
        Rotation::HOURLY
    } else if matches!(config.rotation, Rotation::MINUTELY) {
        Rotation::MINUTELY
    } else if matches!(config.rotation, Rotation::NEVER) {
        Rotation::NEVER
    } else {
        Rotation::DAILY
    };

    let file_appender = tracing_appender::rolling::RollingFileAppender::new(
        rotation,
        &config.log_dir,
        "agiworkforce.log",
    );

    Ok(file_appender)
}

/// Clean up log files older than max_files days
fn cleanup_old_logs(log_dir: &PathBuf, max_files: usize) -> Result<()> {
    let entries = fs::read_dir(log_dir)?;

    let mut log_files: Vec<_> = entries
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.is_file() && path.extension()? == "log" {
                let metadata = fs::metadata(&path).ok()?;
                let modified = metadata.modified().ok()?;
                Some((path, modified))
            } else {
                None
            }
        })
        .collect();

    // Sort by modification time (oldest first)
    log_files.sort_by_key(|(_, modified)| *modified);

    // Remove oldest files if we exceed max_files
    if log_files.len() > max_files {
        for (path, _) in log_files.iter().take(log_files.len() - max_files) {
            if let Err(e) = fs::remove_file(path) {
                eprintln!("Failed to remove old log file {:?}: {}", path, e);
            }
        }
    }

    Ok(())
}

/// Get the current log file path
pub fn get_current_log_path(config: &LogConfig) -> PathBuf {
    config.log_dir.join("agiworkforce.log")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_log_cleanup() {
        let temp_dir = TempDir::new().unwrap();
        let log_dir = temp_dir.path().to_path_buf();

        // Create 10 old log files
        for i in 0..10 {
            let path = log_dir.join(format!("test_{}.log", i));
            let mut file = File::create(&path).unwrap();
            writeln!(file, "test log {}", i).unwrap();
        }

        // Cleanup should keep only 7 most recent
        cleanup_old_logs(&log_dir, 7).unwrap();

        let remaining = fs::read_dir(&log_dir).unwrap().count();
        assert_eq!(remaining, 7);
    }
}
