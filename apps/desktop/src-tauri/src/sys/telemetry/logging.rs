use anyhow::Result;
use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;
use tracing_appender::rolling::{RollingFileAppender, Rotation};

/// File-name prefix the rolling appender writes under. With a rotation other
/// than `NEVER`, `tracing-appender` appends the rotation date, so the files on
/// disk are `agiworkforce.log.<date>` and their extension is the date. Readers
/// must match this prefix, not a `.log` extension.
pub const LOG_FILE_PREFIX: &str = "agiworkforce.log";

static ACTIVE_LOG_DIR: RwLock<Option<PathBuf>> = RwLock::new(None);

/// The directory the file appender actually opened, or `None` if telemetry
/// never initialized.
///
/// Recomputing `LogConfig::default()` later does not answer this: telemetry
/// initializes before Tauri `setup()` publishes the app data dir, so the
/// default resolves through the fallback branch of `sys::utils::app_data_dir()`
/// at startup and through the published directory afterwards. Readers that need
/// the files on disk must use the path that was opened.
pub fn active_log_dir() -> Option<PathBuf> {
    ACTIVE_LOG_DIR
        .read()
        .ok()
        .and_then(|guard| guard.as_ref().cloned())
}

#[derive(Clone)]
pub struct LogConfig {
    pub log_dir: PathBuf,
    pub max_files: usize,
    pub rotation: Rotation,
}

impl Default for LogConfig {
    fn default() -> Self {
        let log_dir = crate::sys::utils::app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("logs");

        Self {
            log_dir,
            max_files: 7,
            rotation: Rotation::DAILY,
        }
    }
}

pub fn create_file_appender(config: &LogConfig) -> Result<RollingFileAppender> {
    fs::create_dir_all(&config.log_dir)?;

    if let Ok(mut active) = ACTIVE_LOG_DIR.write() {
        *active = Some(config.log_dir.clone());
    }

    cleanup_old_logs(&config.log_dir, config.max_files)?;

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
        LOG_FILE_PREFIX,
    );

    Ok(file_appender)
}

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

    log_files.sort_by_key(|(_, modified)| *modified);

    if log_files.len() > max_files {
        for (path, _) in log_files.iter().take(log_files.len() - max_files) {
            if let Err(e) = fs::remove_file(path) {
                tracing::warn!("Failed to remove old log file {:?}: {}", path, e);
            }
        }
    }

    Ok(())
}

pub fn get_current_log_path(config: &LogConfig) -> PathBuf {
    config.log_dir.join("agiworkforce.log")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_log_cleanup() {
        let temp_dir = TempDir::new().unwrap();
        let log_dir = temp_dir.path().to_path_buf();

        for i in 0..10 {
            let path = log_dir.join(format!("test_{}.log", i));

            {
                let mut file = File::create(&path).unwrap();
                writeln!(file, "test log {}", i).unwrap();
            }
        }

        cleanup_old_logs(&log_dir, 7).unwrap();

        let remaining = fs::read_dir(&log_dir).unwrap().count();
        assert_eq!(remaining, 7);
    }
}
