use serde::{Deserialize, Serialize};
use std::fs;

use tauri::command;

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
#[command]
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

            // Truncate long lines (stack traces, serialized JSON)
            let truncated = if sanitized.len() > max_line_bytes {
                format!("{}...[truncated]", &sanitized[..max_line_bytes])
            } else {
                sanitized
            };

            total_bytes += truncated.len();
            filtered_lines.push(truncated);
        }
    }

    Ok(filtered_lines)
}

#[command]
pub async fn submit_feedback(
    subject: String,
    message: String,
    user_id: Option<String>,
    metadata: FeedbackMetadata,
    logs: Option<String>,
) -> Result<(), String> {
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
