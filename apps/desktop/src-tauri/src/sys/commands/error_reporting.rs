use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::sys::support_bundle::{bundle_log_dir, collect_bundle_lines, LevelFilter};

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
        stack_trace = ?error_data.stack_trace,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::telemetry::logging::{create_file_appender, LogConfig};
    use std::fs;
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

    /// The single report `src/stores/ui.ts` sends and the batch entries
    /// `src/services/errorReporting.ts` sends share this shape.
    #[tokio::test]
    async fn a_report_from_the_ui_is_read_and_logged() {
        let report: ErrorReport = serde_json::from_value(serde_json::json!({
            "error_type": "network",
            "message": "request failed",
            "stack_trace": "at send (chat.ts:10)",
            "context": { "conversationId": "c-1" },
            "timestamp": 1_790_000_000_000_u64,
        }))
        .expect("report as the UI sends it");
        assert_eq!(report.error_type, "network");
        assert_eq!(report.stack_trace.as_deref(), Some("at send (chat.ts:10)"));
        assert!(error_report(report).await.is_ok());

        let without_stack: ErrorReport = serde_json::from_value(serde_json::json!({
            "error_type": "network",
            "message": "request failed",
            "context": {},
            "timestamp": 1_790_000_000_000_u64,
        }))
        .expect("a report with no stack");
        assert_eq!(without_stack.stack_trace, None);
    }

    const CONVERSATION_RECORD: &str = r#"{"timestamp":"2026-08-09T10:00:00Z","level":"ERROR","fields":{"message":"send_message failed","correlation_id":"corr-42","prompt":"help me write my divorce filing","content":"Dear Ada, the merger closes Friday"},"target":"chat","filename":"src/chat.rs","line_number":7}"#;

    #[tokio::test]
    #[serial_test::serial]
    async fn error_get_logs_finds_rotated_files_and_drops_conversation_content() {
        let dir = tempfile::tempdir().expect("temp dir");
        seed_log_dir(dir.path(), &[CONVERSATION_RECORD]);

        let recent = error_get_logs(50).await.expect("error_get_logs succeeds");

        // The reader previously looked for `agiworkforce.log` in Tauri's
        // app_log_dir and found nothing, so every bundle was empty.
        assert_eq!(recent.len(), 1, "{recent:?}");

        let haystack = recent.join("\n");
        assert!(haystack.contains("send_message failed"), "{haystack}");
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
