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
    tracing::info!(
        "Message feedback: {} on message {} (conv {:?}, correction: {:?})",
        feedback_type,
        message_id,
        conversation_id,
        correction,
    );
    // Store locally for analytics batch upload
    // In future: persist to SQLite analytics table
    Ok(())
}
