use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use tauri::Manager;

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

    if let Ok(sentry_dsn) = std::env::var("SENTRY_DSN") {
        if !sentry_dsn.is_empty() {
            let payload = serde_json::json!({
                "event_id": uuid::Uuid::new_v4().to_string(),
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "level": "error",
                "logger": "agiworkforce",
                "message": {
                    "formatted": format!("{}: {}", error_data.error_type, error_data.message)
                },
                "exception": {
                    "values": [{
                        "type": error_data.error_type,
                        "value": error_data.message,
                        "stacktrace": error_data.stack_trace.map(|s| {
                            serde_json::json!({ "frames": [{ "function": s }] })
                        })
                    }]
                },
                "extra": error_data.context
            });

            // Bug #81 fix: Sentry DSN is a full URL like
            // `https://<key>@<host>/<project_id>`. The store endpoint must
            // be constructed as `https://<host>/api/<project_id>/store/`
            // with the auth key passed via the `X-Sentry-Auth` header,
            // NOT by naively appending `/api/store/` to the DSN (which
            // strips the key embedded in the userinfo portion of the URL).
            let sentry_url = match url::Url::parse(&sentry_dsn) {
                Ok(parsed) => {
                    let sentry_key = parsed.username().to_string();
                    let host = parsed.host_str().unwrap_or("sentry.io").to_string();
                    let scheme = parsed.scheme().to_string();
                    let port_str = parsed.port().map(|p| format!(":{}", p)).unwrap_or_default();
                    let project_id = parsed
                        .path_segments()
                        .and_then(|mut s| s.next())
                        .unwrap_or("0")
                        .to_string();
                    let store_url = format!(
                        "{}://{}{}/api/{}/store/",
                        scheme, host, port_str, project_id
                    );
                    // Attach auth header to the payload
                    let auth_header = format!("Sentry sentry_version=7, sentry_key={}", sentry_key);
                    (store_url, auth_header)
                }
                Err(_) => {
                    // Fallback: treat DSN as-is (backwards compat)
                    let url = format!("{}/api/store/", sentry_dsn.trim_end_matches('/'));
                    (url, String::new())
                }
            };
            let (sentry_store_url, sentry_auth_header) = sentry_url;
            tokio::spawn(async move {
                if let Ok(client) = reqwest::Client::builder()
                    .timeout(std::time::Duration::from_secs(5))
                    .build()
                {
                    let mut req = client
                        .post(&sentry_store_url)
                        .header("Content-Type", "application/json");
                    if !sentry_auth_header.is_empty() {
                        req = req.header("X-Sentry-Auth", &sentry_auth_header);
                    }
                    let _ = req.json(&payload).send().await;
                }
            });
        }
    }

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

#[tauri::command]
pub async fn error_get_logs(app: tauri::AppHandle, lines: usize) -> Result<Vec<String>, String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get log directory: {}", e))?;

    let log_file = log_dir.join("agiworkforce.log");

    if !log_file.exists() {
        return Ok(Vec::new());
    }

    let content =
        fs::read_to_string(&log_file).map_err(|e| format!("Failed to read log file: {}", e))?;

    let all_lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

    let start = all_lines.len().saturating_sub(lines);
    Ok(all_lines[start..].to_vec())
}

#[tauri::command]
pub async fn error_clear_logs(app: tauri::AppHandle) -> Result<(), String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get log directory: {}", e))?;

    if !log_dir.exists() {
        return Ok(());
    }

    let entries =
        fs::read_dir(&log_dir).map_err(|e| format!("Failed to read log directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("log") {
            fs::remove_file(&path).map_err(|e| format!("Failed to remove log file: {}", e))?;
            tracing::info!("Removed log file: {:?}", path);
        }
    }

    tracing::info!("All log files cleared");
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
pub async fn error_get_stats(app: tauri::AppHandle) -> Result<ErrorStats, String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get log directory: {}", e))?;

    let log_file = log_dir.join("agiworkforce.log");

    let (total_errors, critical_errors, warnings) = if log_file.exists() {
        let content =
            fs::read_to_string(&log_file).map_err(|e| format!("Failed to read log file: {}", e))?;

        let total = content.matches("ERROR").count();
        let critical = content.matches("CRITICAL").count();
        let warn = content.matches("WARN").count();

        (total, critical, warn)
    } else {
        (0, 0, 0)
    };

    let log_file_size = if log_file.exists() {
        fs::metadata(&log_file)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .len()
    } else {
        0
    };

    Ok(ErrorStats {
        total_errors,
        critical_errors,
        warnings,
        log_file_size_bytes: log_file_size,
    })
}

#[tauri::command]
pub async fn error_export_logs(app: tauri::AppHandle) -> Result<String, String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get log directory: {}", e))?;

    let log_file = log_dir.join("agiworkforce.log");

    if !log_file.exists() {
        return Ok("[]".to_string());
    }

    let content =
        fs::read_to_string(&log_file).map_err(|e| format!("Failed to read log file: {}", e))?;

    let logs: Vec<HashMap<String, String>> = content
        .lines()
        .map(|line| {
            let mut entry = HashMap::new();
            entry.insert("line".to_string(), line.to_string());
            entry
        })
        .collect();

    serde_json::to_string_pretty(&logs).map_err(|e| format!("Failed to serialize logs: {}", e))
}
