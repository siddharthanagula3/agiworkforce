use serde::{Deserialize, Serialize};
use std::fs;

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

/// Reads the application log files and returns only WARN/ERROR lines,
/// with sensitive data stripped. Used by the feedback dialog to attach
/// filtered diagnostic logs.
#[tauri::command]
pub async fn get_filtered_logs(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri::Manager;

    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get log directory: {}", e))?;

    if !log_dir.exists() {
        return Ok(Vec::new());
    }

    // Collect all .log files sorted by modification time (newest first)
    let mut log_files: Vec<_> = fs::read_dir(&log_dir)
        .map_err(|e| format!("Failed to read log directory: {}", e))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .path()
                .extension()
                .and_then(|s| s.to_str())
                .map(|ext| ext == "log")
                .unwrap_or(false)
        })
        .collect();

    log_files.sort_by(|a, b| {
        let a_time = a.metadata().ok().and_then(|m| m.modified().ok());
        let b_time = b.metadata().ok().and_then(|m| m.modified().ok());
        b_time.cmp(&a_time) // newest first
    });

    // Match tracing-subscriber level markers with word boundaries to avoid
    // false positives on words like "browser", "general", "warning" etc.
    fn is_warn_or_error_line(line: &str) -> bool {
        line.contains(" WARN ")
            || line.contains(" ERROR ")
            || line.starts_with("WARN ")
            || line.starts_with("ERROR ")
    }

    // Keywords to exclude — these leak user account/billing data
    let exclude_patterns = [
        "credits",
        "balance",
        "account_id",
        "billing",
        "subscription",
        "payment",
        "stripe",
        "invoice",
        "price_id",
        "customer_id",
        "card_",
        "bank_",
    ];

    let mut filtered_lines: Vec<String> = Vec::new();
    let max_lines: usize = 500;
    let max_line_bytes: usize = 512;
    let max_total_bytes: usize = 200_000; // ~200 KB ceiling
    let mut total_bytes: usize = 0;

    for entry in &log_files {
        if filtered_lines.len() >= max_lines || total_bytes >= max_total_bytes {
            break;
        }

        let path = entry.path();
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        for line in content.lines() {
            if filtered_lines.len() >= max_lines || total_bytes >= max_total_bytes {
                break;
            }

            // Only include WARN and ERROR lines
            if !is_warn_or_error_line(line) {
                continue;
            }

            // Exclude lines with account/billing keywords (case-insensitive)
            let line_lower = line.to_lowercase();
            let has_excluded = exclude_patterns
                .iter()
                .any(|pattern| line_lower.contains(pattern));
            if has_excluded {
                continue;
            }

            // Apply sensitive data filtering
            let sanitized = crate::sys::logging::filter_sensitive_data(line);

            // Truncate long lines (stack traces, serialized JSON).
            // Walk backwards to find a valid UTF-8 char boundary to avoid
            // panicking on multi-byte codepoints.
            let truncated = if sanitized.len() > max_line_bytes {
                let mut end = max_line_bytes;
                while !sanitized.is_char_boundary(end) && end > 0 {
                    end -= 1;
                }
                format!("{}...[truncated]", &sanitized[..end])
            } else {
                sanitized
            };

            total_bytes += truncated.len();
            filtered_lines.push(truncated);
        }
    }

    Ok(filtered_lines)
}

#[tauri::command]
pub async fn submit_feedback(
    subject: String,
    message: String,
    user_id: Option<String>,
    metadata: FeedbackMetadata,
    logs: Option<String>,
) -> Result<(), String> {
    // SECURITY: Using the anon key intentionally here because feedback can be submitted
    // before the user is authenticated (e.g., from the login screen). The `feedback` table
    // MUST have an RLS policy that only allows INSERT for anon and restricts SELECT/UPDATE/DELETE
    // to service_role. If authenticated-only feedback is desired, accept a user JWT parameter instead.
    let supabase_url = std::env::var("VITE_SUPABASE_URL")
        .or_else(|_| std::env::var("SUPABASE_URL"))
        .unwrap_or_default();
    let supabase_key = std::env::var("VITE_SUPABASE_ANON_KEY")
        .or_else(|_| std::env::var("SUPABASE_ANON_KEY"))
        .unwrap_or_default();

    if supabase_url.is_empty() || supabase_key.is_empty() {
        return Err("Missing Supabase configuration".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let url = format!("{}/rest/v1/feedback", supabase_url);

    let payload = FeedbackPayload {
        subject,
        message,
        user_id,
        metadata,
        logs,
    };

    let res = client
        .post(&url)
        .header("apikey", &supabase_key)
        .header("Authorization", format!("Bearer {}", supabase_key))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Supabase error {}: {}", status, text));
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
