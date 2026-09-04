use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;

use crate::sys::support_bundle::{
    bundle_log_dir, collect_bundle_lines, log_files_newest_first, LevelFilter, MAX_BUNDLE_LINES,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorReport {
    pub error_type: String,
    pub message: String,
    pub stack_trace: Option<String>,
    pub context: HashMap<String, serde_json::Value>,
    pub timestamp: u64,
}

#[tauri::command]
pub async fn error_report(error_data: ErrorReport) -> Result<(), String> {
    tracing::error!(
        error_type = %error_data.error_type,
        message = %error_data.message,
        timestamp = error_data.timestamp,
        context = ?error_data.context,
        "Error reported from frontend"
    );

    Ok(())
}

#[tauri::command]
pub async fn error_report_batch(reports: Vec<ErrorReport>) -> Result<(), String> {
    tracing::info!("Received batch of {} error reports", reports.len());

    for report in reports {
        error_report(report).await?;
    }

    Ok(())
}

/// Recent log records, redacted for a support bundle.
///
/// See `crate::sys::support_bundle` for what redaction keeps and drops. This
/// hands log text to the webview, so it must not return raw log lines.
#[tauri::command]
pub async fn error_get_logs(lines: usize) -> Result<Vec<String>, String> {
    Ok(collect_bundle_lines(
        &bundle_log_dir(),
        LevelFilter::All,
        lines,
    ))
}

#[tauri::command]
pub async fn error_clear_logs() -> Result<(), String> {
    let files = log_files_newest_first(&bundle_log_dir());
    let attempted = files.len();
    let mut last_error: Option<String> = None;
    let mut removed = 0usize;

    for path in files {
        match fs::remove_file(&path) {
            Ok(()) => removed += 1,
            // On Windows the file the appender currently holds open cannot be
            // unlinked. Keep going and report only if nothing could be removed.
            Err(e) => last_error = Some(format!("{}: {}", path.display(), e)),
        }
    }

    if removed == 0 && attempted > 0 {
        return Err(format!(
            "Failed to remove log files: {}",
            last_error.unwrap_or_else(|| "unknown error".to_string())
        ));
    }

    tracing::info!("Cleared {removed} of {attempted} log files");
    Ok(())
}

#[derive(Serialize)]
pub struct ErrorStats {
    pub total_errors: usize,
    pub critical_errors: usize,
    pub warnings: usize,
    pub log_file_size_bytes: u64,
}

#[tauri::command]
pub async fn error_get_stats() -> Result<ErrorStats, String> {
    let mut stats = ErrorStats {
        total_errors: 0,
        critical_errors: 0,
        warnings: 0,
        log_file_size_bytes: 0,
    };

    for path in log_files_newest_first(&bundle_log_dir()) {
        stats.log_file_size_bytes += fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);

        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        stats.total_errors += content.matches("\"level\":\"ERROR\"").count();
        stats.critical_errors += content.matches("CRITICAL").count();
        stats.warnings += content.matches("\"level\":\"WARN\"").count();
    }

    Ok(stats)
}

/// Exports the log as a JSON array of `{"line": …}` entries, redacted for a
/// support bundle. See `crate::sys::support_bundle`.
#[tauri::command]
pub async fn error_export_logs() -> Result<String, String> {
    let logs: Vec<HashMap<String, String>> =
        collect_bundle_lines(&bundle_log_dir(), LevelFilter::All, MAX_BUNDLE_LINES)
            .into_iter()
            .map(|line| HashMap::from([("line".to_string(), line)]))
            .collect();

    serde_json::to_string_pretty(&logs).map_err(|e| format!("Failed to serialize logs: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::commands::feedback::get_filtered_logs;
    use crate::sys::telemetry::logging::{create_file_appender, LogConfig};
    use std::io::Write;

    /// Publishes `dir` as the active log directory through the same function
    /// telemetry startup uses, then writes one rotated log file into it.
    ///
    /// The rotated name matters: `RollingFileAppender` writes
    /// `agiworkforce.log.<date>`, and every reader here has to find that.
    fn seed_log_dir(dir: &std::path::Path, records: &[&str]) {
        let config = LogConfig {
            log_dir: dir.to_path_buf(),
            max_files: 7,
            rotation: tracing_appender::rolling::Rotation::DAILY,
        };
        let _appender = create_file_appender(&config).expect("appender opens");

        let mut file = fs::File::create(dir.join("agiworkforce.log.2026-08-09"))
            .expect("create rotated log file");
        for record in records {
            writeln!(file, "{record}").expect("write record");
        }
    }

    const CONVERSATION_RECORD: &str = r#"{"timestamp":"2026-08-09T10:00:00Z","level":"ERROR","fields":{"message":"send_message failed","correlation_id":"corr-42","prompt":"help me write my divorce filing","content":"Dear Ada, the merger closes Friday"},"target":"chat","filename":"src/chat.rs","line_number":7}"#;

    #[tokio::test]
    #[serial_test::serial]
    async fn log_export_commands_find_rotated_files_and_drop_conversation_content() {
        let dir = tempfile::tempdir().expect("temp dir");
        seed_log_dir(dir.path(), &[CONVERSATION_RECORD]);

        let recent = error_get_logs(50).await.expect("error_get_logs succeeds");
        let exported = error_export_logs()
            .await
            .expect("error_export_logs succeeds");
        let attached = get_filtered_logs()
            .await
            .expect("get_filtered_logs succeeds");

        // The readers previously looked for `agiworkforce.log` in Tauri's
        // app_log_dir and found nothing, so every bundle was empty.
        assert_eq!(recent.len(), 1, "{recent:?}");
        assert_eq!(attached.len(), 1, "{attached:?}");
        assert!(exported.contains("send_message failed"), "{exported}");

        for haystack in [recent.join("\n"), exported, attached.join("\n")] {
            assert!(
                haystack.contains("correlation_id=corr-42"),
                "correlation id must survive: {haystack}"
            );
            assert!(
                !haystack.contains("divorce filing"),
                "prompt text must not reach a support bundle: {haystack}"
            );
            assert!(
                !haystack.contains("Dear Ada"),
                "message content must not reach a support bundle: {haystack}"
            );
        }
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn error_get_stats_counts_rotated_files() {
        let dir = tempfile::tempdir().expect("temp dir");
        seed_log_dir(
            dir.path(),
            &[
                CONVERSATION_RECORD,
                r#"{"timestamp":"2026-08-09T10:00:01Z","level":"WARN","fields":{"message":"retrying"},"target":"chat"}"#,
            ],
        );

        let stats = error_get_stats().await.expect("error_get_stats succeeds");

        assert_eq!(stats.total_errors, 1);
        assert_eq!(stats.warnings, 1);
        assert!(stats.log_file_size_bytes > 0);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn error_clear_logs_removes_rotated_files() {
        let dir = tempfile::tempdir().expect("temp dir");
        seed_log_dir(dir.path(), &[CONVERSATION_RECORD]);
        assert!(!log_files_newest_first(dir.path()).is_empty());

        error_clear_logs().await.expect("error_clear_logs succeeds");

        assert!(
            log_files_newest_first(dir.path()).is_empty(),
            "clearing logs must actually delete the rotated files"
        );
    }
}
