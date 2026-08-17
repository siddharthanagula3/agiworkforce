use serde::{Deserialize, Serialize};

use crate::sys::support_bundle::{
    bundle_log_dir, collect_bundle_lines, LevelFilter, MAX_BUNDLE_LINES,
};

#[derive(Debug, Serialize, Deserialize)]
pub struct FeedbackPayload {
    pub subject: String,
    pub message: String,
    pub user_id: Option<String>,
    pub metadata: FeedbackMetadata,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logs: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FeedbackMetadata {
    pub platform: String,
    pub version: String,
    pub user_agent: String,
}

/// Reads the application log files and returns WARN/ERROR records redacted for
/// a support bundle. Used by the feedback dialog to attach diagnostic logs,
/// which are then uploaded with the report — see
/// `crate::sys::support_bundle` for exactly what survives redaction.
#[tauri::command]
pub async fn get_filtered_logs() -> Result<Vec<String>, String> {
    Ok(collect_bundle_lines(
        &bundle_log_dir(),
        LevelFilter::WarnAndError,
        MAX_BUNDLE_LINES,
    ))
}

#[tauri::command]
pub async fn submit_feedback(
    subject: String,
    message: String,
    user_id: Option<String>,
    metadata: FeedbackMetadata,
    logs: Option<String>,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let url = format!("{}/api/feedback", crate::sys::account::get_api_base_url());

    let payload = FeedbackPayload {
        subject,
        message,
        user_id,
        metadata,
        logs,
    };

    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Feedback API error {}: {}", status, text));
    }

    Ok(())
}

#[tauri::command]
pub async fn record_message_feedback(
    message_id: String,
    conversation_id: Option<String>,
    feedback_type: String,
    correction: Option<String>,
    _category: Option<String>,
) -> Result<(), String> {
    // `correction` is user prose about a conversation. Support bundles keep the
    // free-form `message` string, so formatting it in here would ship it to
    // support; only its length is diagnostic. See `crate::sys::support_bundle`.
    tracing::info!(
        operation = "record_message_feedback",
        message_id = %message_id,
        conversation_id = ?conversation_id,
        status = %feedback_type,
        correction_chars = correction.as_deref().map_or(0, |text| text.chars().count()),
        "Message feedback recorded"
    );
    // Store locally for analytics batch upload
    // In future: persist to SQLite analytics table
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::commands::error_reporting::error_get_logs;
    use crate::sys::telemetry::logging::{create_file_appender, LogConfig};
    use tracing_subscriber::layer::SubscriberExt;

    const CORRECTION: &str = "the clinic is on Rosewood Lane, and my daughter's name is Ada";

    /// Runs `record_message_feedback` against a real JSON file appender in a
    /// temp log dir — the same writer telemetry startup opens, which also
    /// publishes the dir the bundle readers use — then returns the bundle those
    /// readers actually produce.
    fn bundle_after_recording_feedback() -> Vec<String> {
        let dir = tempfile::tempdir().expect("temp dir");
        let appender = create_file_appender(&LogConfig {
            log_dir: dir.path().to_path_buf(),
            max_files: 7,
            rotation: tracing_appender::rolling::Rotation::DAILY,
        })
        .expect("appender opens");

        let subscriber = tracing_subscriber::registry().with(
            tracing_subscriber::fmt::layer()
                .json()
                .with_writer(std::sync::Mutex::new(appender))
                .with_target(true)
                .with_file(true)
                .with_line_number(true),
        );

        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("runtime");

        tracing::subscriber::with_default(subscriber, || {
            runtime
                .block_on(record_message_feedback(
                    "msg-77".to_string(),
                    Some("conv-77".to_string()),
                    "thumbs_down".to_string(),
                    Some(CORRECTION.to_string()),
                    Some("accuracy".to_string()),
                ))
                .expect("record_message_feedback succeeds");
        });

        runtime
            .block_on(error_get_logs(MAX_BUNDLE_LINES))
            .expect("error_get_logs succeeds")
    }

    #[test]
    #[serial_test::serial]
    fn message_feedback_correction_text_never_reaches_a_support_bundle() {
        let bundle = bundle_after_recording_feedback();
        let text = bundle.join("\n");

        assert!(
            text.contains("Message feedback recorded"),
            "the feedback event must reach the bundle at all: {text}"
        );
        assert!(
            !text.contains("Rosewood Lane") && !text.contains("Ada"),
            "user correction prose must not reach a support bundle: {text}"
        );
    }

    #[test]
    #[serial_test::serial]
    fn message_feedback_keeps_the_identifiers_support_needs() {
        let bundle = bundle_after_recording_feedback();
        let text = bundle.join("\n");

        assert!(text.contains("message_id=msg-77"), "{text}");
        assert!(text.contains("conversation_id="), "{text}");
        assert!(text.contains("status=thumbs_down"), "{text}");
    }
}
